import json
import os
import re
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

from flask import Flask, jsonify, request, send_from_directory # type: ignore

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "carejr.db"

OTP_TTL_SECONDS = 180
SESSION_TTL_HOURS = 24 * 7

PHONE_RE = re.compile(r"^\d{10}$")
PINCODE_RE = re.compile(r"^\d{6}$")

app = Flask(__name__, static_folder=None)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def isoformat_utc(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat()


def parse_iso(value: str) -> Optional[datetime]:
    try:
        return datetime.fromisoformat(value)
    except Exception:
        return None


def get_db() -> sqlite3.Connection:
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def init_db() -> None:
    with get_db() as db:
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                phone TEXT PRIMARY KEY,
                clinic_code TEXT DEFAULT '',
                name TEXT DEFAULT '',
                dob TEXT DEFAULT '',
                gender TEXT DEFAULT '',
                blood_group TEXT DEFAULT '',
                state TEXT DEFAULT '',
                city TEXT DEFAULT '',
                pincode TEXT DEFAULT '',
                address TEXT DEFAULT '',
                emergency_contact TEXT DEFAULT '',
                updated_at TEXT NOT NULL
            )
            """
        )
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS otps (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                phone TEXT NOT NULL,
                otp TEXT NOT NULL,
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                used INTEGER NOT NULL DEFAULT 0
            )
            """
        )
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS sessions (
                token TEXT PRIMARY KEY,
                phone TEXT NOT NULL,
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL
            )
            """
        )
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS reports (
                phone TEXT NOT NULL,
                id TEXT NOT NULL,
                payload TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                PRIMARY KEY (phone, id)
            )
            """
        )


def cleanup_expired_data() -> None:
    now = isoformat_utc(utc_now())
    with get_db() as db:
        db.execute("DELETE FROM otps WHERE expires_at < ? OR used = 1", (now,))
        db.execute("DELETE FROM sessions WHERE expires_at < ?", (now,))


def json_error(message: str, status: int = 400):
    return jsonify({"ok": False, "error": message}), status


def get_bearer_phone() -> Tuple[Optional[str], Optional[str]]:
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None, None

    token = header.split(" ", 1)[1].strip()
    if not token:
        return None, None

    with get_db() as db:
        session_row = db.execute(
            "SELECT phone, expires_at FROM sessions WHERE token = ?",
            (token,),
        ).fetchone()

        if not session_row:
            return None, None

        expires_at = parse_iso(session_row["expires_at"])
        if not expires_at or expires_at <= utc_now():
            db.execute("DELETE FROM sessions WHERE token = ?", (token,))
            return None, None

        return str(session_row["phone"]), token


def require_auth() -> Tuple[Optional[str], Optional[str], Optional[Any]]:
    phone, token = get_bearer_phone()
    if not phone:
        return None, None, json_error("Unauthorized", 401)
    return phone, token, None


def normalize_profile_payload(data: Dict[str, Any]) -> Dict[str, str]:
    return {
        "phone": str(data.get("phone", "")).strip(),
        "clinicCode": str(data.get("clinicCode", "")).strip().upper(),
        "name": str(data.get("name", "")).strip(),
        "dob": str(data.get("dob", "")).strip(),
        "gender": str(data.get("gender", "")).strip(),
        "bloodGroup": str(data.get("bloodGroup", "")).strip(),
        "state": str(data.get("state", "")).strip(),
        "city": str(data.get("city", "")).strip(),
        "pincode": str(data.get("pincode", "")).strip(),
        "address": str(data.get("address", "")).strip(),
        "emergencyContact": str(data.get("emergencyContact", "")).strip(),
    }


@app.before_request
def _before_request():
    if request.path.startswith("/api/"):
        cleanup_expired_data()


@app.route("/api/health", methods=["GET"])
def health_check():
    return jsonify({"ok": True, "service": "carejr-python-backend"})


@app.route("/api/send-otp", methods=["POST"])
def send_otp():
    data = request.get_json(silent=True) or {}
    phone = str(data.get("phone", "")).strip()
    clinic_code = str(data.get("clinicCode", "")).strip().upper()

    if not PHONE_RE.match(phone):
        return json_error("Enter a valid 10-digit phone number.", 400)

    otp = f"{secrets.randbelow(9000) + 1000:04d}"
    now = utc_now()
    expires_at = now + timedelta(seconds=OTP_TTL_SECONDS)

    with get_db() as db:
        db.execute(
            """
            INSERT INTO otps (phone, otp, created_at, expires_at, used)
            VALUES (?, ?, ?, ?, 0)
            """,
            (phone, otp, isoformat_utc(now), isoformat_utc(expires_at)),
        )
        db.execute(
            """
            INSERT INTO users (phone, clinic_code, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(phone) DO UPDATE SET
                clinic_code = excluded.clinic_code,
                updated_at = excluded.updated_at
            """,
            (phone, clinic_code, isoformat_utc(now)),
        )

    return jsonify(
        {
            "ok": True,
            "message": "OTP sent successfully.",
            "demoOtp": otp,
            "cooldownSeconds": 20,
            "expiresInSeconds": OTP_TTL_SECONDS,
        }
    )


@app.route("/api/verify-otp", methods=["POST"])
def verify_otp():
    data = request.get_json(silent=True) or {}
    phone = str(data.get("phone", "")).strip()
    otp = str(data.get("otp", "")).strip()

    if not PHONE_RE.match(phone):
        return json_error("Enter a valid 10-digit phone number.", 400)
    if not re.match(r"^\d{4}$", otp):
        return json_error("OTP must be a 4-digit number.", 400)

    now = utc_now()
    with get_db() as db:
        otp_row = db.execute(
            """
            SELECT id, expires_at
            FROM otps
            WHERE phone = ? AND otp = ? AND used = 0
            ORDER BY id DESC
            LIMIT 1
            """,
            (phone, otp),
        ).fetchone()

        if not otp_row:
            return json_error("Invalid OTP. Please try again.", 401)

        expires_at = parse_iso(otp_row["expires_at"])
        if not expires_at or expires_at <= now:
            db.execute("UPDATE otps SET used = 1 WHERE id = ?", (otp_row["id"],))
            return json_error("OTP expired. Please request a new OTP.", 401)

        db.execute("UPDATE otps SET used = 1 WHERE id = ?", (otp_row["id"],))
        token = secrets.token_urlsafe(32)
        session_expires = now + timedelta(hours=SESSION_TTL_HOURS)
        db.execute(
            """
            INSERT INTO sessions (token, phone, created_at, expires_at)
            VALUES (?, ?, ?, ?)
            """,
            (token, phone, isoformat_utc(now), isoformat_utc(session_expires)),
        )

    return jsonify(
        {
            "ok": True,
            "phone": phone,
            "sessionToken": token,
            "expiresAt": isoformat_utc(session_expires),
        }
    )


@app.route("/api/logout", methods=["POST"])
def logout():
    _, token = get_bearer_phone()
    if token:
        with get_db() as db:
            db.execute("DELETE FROM sessions WHERE token = ?", (token,))
    return jsonify({"ok": True})


@app.route("/api/profile", methods=["GET"])
def get_profile():
    phone, _, auth_error = require_auth()
    if auth_error:
        return auth_error

    with get_db() as db:
        row = db.execute(
            """
            SELECT phone, clinic_code, name, dob, gender, blood_group,
                   state, city, pincode, address, emergency_contact
            FROM users
            WHERE phone = ?
            """,
            (phone,),
        ).fetchone()

    if not row:
        return jsonify(
            {
                "ok": True,
                "profile": {
                    "phone": phone,
                    "clinicCode": "",
                    "name": "",
                    "dob": "",
                    "gender": "",
                    "bloodGroup": "",
                    "state": "",
                    "city": "",
                    "pincode": "",
                    "address": "",
                    "emergencyContact": "",
                },
            }
        )

    return jsonify(
        {
            "ok": True,
            "profile": {
                "phone": row["phone"],
                "clinicCode": row["clinic_code"] or "",
                "name": row["name"] or "",
                "dob": row["dob"] or "",
                "gender": row["gender"] or "",
                "bloodGroup": row["blood_group"] or "",
                "state": row["state"] or "",
                "city": row["city"] or "",
                "pincode": row["pincode"] or "",
                "address": row["address"] or "",
                "emergencyContact": row["emergency_contact"] or "",
            },
        }
    )


@app.route("/api/profile", methods=["POST"])
def save_profile():
    phone, _, auth_error = require_auth()
    if auth_error:
        return auth_error

    payload = normalize_profile_payload(request.get_json(silent=True) or {})
    payload["phone"] = phone # type: ignore

    if payload["name"] and len(payload["name"]) < 2:
        return json_error("Name is too short.", 400)
    if payload["pincode"] and not PINCODE_RE.match(payload["pincode"]):
        return json_error("Pincode must be a valid 6-digit number.", 400)
    if payload["emergencyContact"] and not PHONE_RE.match(payload["emergencyContact"]):
        return json_error("Emergency contact must be a valid 10-digit number.", 400)

    with get_db() as db:
        db.execute(
            """
            INSERT INTO users (
                phone, clinic_code, name, dob, gender, blood_group,
                state, city, pincode, address, emergency_contact, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(phone) DO UPDATE SET
                clinic_code = excluded.clinic_code,
                name = excluded.name,
                dob = excluded.dob,
                gender = excluded.gender,
                blood_group = excluded.blood_group,
                state = excluded.state,
                city = excluded.city,
                pincode = excluded.pincode,
                address = excluded.address,
                emergency_contact = excluded.emergency_contact,
                updated_at = excluded.updated_at
            """,
            (
                payload["phone"],
                payload["clinicCode"],
                payload["name"],
                payload["dob"],
                payload["gender"],
                payload["bloodGroup"],
                payload["state"],
                payload["city"],
                payload["pincode"],
                payload["address"],
                payload["emergencyContact"],
                isoformat_utc(utc_now()),
            ),
        )

    return jsonify({"ok": True})


@app.route("/api/reports", methods=["GET"])
def list_reports():
    phone, _, auth_error = require_auth()
    if auth_error:
        return auth_error

    with get_db() as db:
        rows = db.execute(
            """
            SELECT payload
            FROM reports
            WHERE phone = ?
            ORDER BY created_at DESC, updated_at DESC
            """,
            (phone,),
        ).fetchall()

    reports = []
    for row in rows:
        try:
            reports.append(json.loads(row["payload"]))
        except Exception:
            continue

    return jsonify({"ok": True, "reports": reports})


@app.route("/api/reports", methods=["POST"])
def upsert_report():
    phone, _, auth_error = require_auth()
    if auth_error:
        return auth_error

    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return json_error("Invalid report payload.", 400)

    report_id = str(data.get("id", "")).strip()
    if not report_id:
        report_id = f"report-{int(datetime.now().timestamp() * 1000)}-{secrets.randbelow(1000)}"
        data["id"] = report_id

    now = isoformat_utc(utc_now())
    data.setdefault("createdAt", now)
    payload = json.dumps(data, ensure_ascii=True)

    with get_db() as db:
        existing = db.execute(
            "SELECT created_at FROM reports WHERE phone = ? AND id = ?",
            (phone, report_id),
        ).fetchone()
        created_at = existing["created_at"] if existing else now

        db.execute(
            """
            INSERT INTO reports (phone, id, payload, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(phone, id) DO UPDATE SET
                payload = excluded.payload,
                updated_at = excluded.updated_at
            """,
            (phone, report_id, payload, created_at, now),
        )

    return jsonify({"ok": True, "report": data})


@app.route("/api/reports", methods=["DELETE"])
def clear_reports():
    phone, _, auth_error = require_auth()
    if auth_error:
        return auth_error

    with get_db() as db:
        result = db.execute("DELETE FROM reports WHERE phone = ?", (phone,))

    return jsonify({"ok": True, "deleted": result.rowcount})


@app.route("/api/reports/<report_id>", methods=["DELETE"])
def delete_report(report_id: str):
    phone, _, auth_error = require_auth()
    if auth_error:
        return auth_error

    with get_db() as db:
        result = db.execute(
            "DELETE FROM reports WHERE phone = ? AND id = ?",
            (phone, report_id),
        )

    if result.rowcount == 0:
        return json_error("Report not found.", 404)

    return jsonify({"ok": True})


@app.route("/", defaults={"path": "login.html"})
@app.route("/<path:path>")
def serve_frontend(path: str):
    if path.startswith("api/"):
        return json_error("Not found.", 404)

    file_path = (BASE_DIR / path).resolve()
    if not str(file_path).startswith(str(BASE_DIR)) or not file_path.is_file():
        return json_error("Not found.", 404)

    return send_from_directory(BASE_DIR, path)


if __name__ == "__main__":
    init_db()
    port = int(os.environ.get("PORT", "5000"))
    app.run(host="0.0.0.0", port=port, debug=False)

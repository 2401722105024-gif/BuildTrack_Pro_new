import os
import json
import socket
import threading
import time
import sqlite3
import webbrowser
import base64
from flask import Flask, request, jsonify, send_file, send_from_directory, redirect
from flask_cors import CORS
import excel_manager
from excel_manager import (
    init_excel,
    add_entry as add_record,
    get_all_records,
    delete_record,
    delete_site_data,
    get_next_id,
    sync_project_sheets,
    create_project_excel_file,
    EXCEL_FILE
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static") if os.path.isdir(os.path.join(BASE_DIR, "static")) else BASE_DIR
UPLOADS_DIR = os.path.join(BASE_DIR, "uploads")
os.makedirs(UPLOADS_DIR, exist_ok=True)

PROJECTS_FILE = os.path.join(BASE_DIR, "projects.json")
USERS_FILE = os.path.join(BASE_DIR, "users.json")
PROJECTS_BACKUP_FILE = os.path.join(BASE_DIR, "projects_backup.json")
USERS_BACKUP_FILE = os.path.join(BASE_DIR, "users_backup.json")
DELETED_USERS_FILE = os.path.join(BASE_DIR, "deleted_users.json")
DELETED_PROJECTS_FILE = os.path.join(BASE_DIR, "deleted_projects.json")
DB_FILE = os.path.join(BASE_DIR, "buildtrack.db")

USERS_LOCK = threading.Lock()
PROJECTS_LOCK = threading.Lock()

def get_db_connection():
    conn = sqlite3.connect(DB_FILE, timeout=30)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=5000")
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute('''
        CREATE TABLE IF NOT EXISTS company_users (
            email TEXT PRIMARY KEY,
            name TEXT,
            role TEXT,
            password TEXT,
            status TEXT,
            last_active TEXT,
            created_at TEXT
        )
    ''')
    cur.execute('''
        CREATE TABLE IF NOT EXISTS deleted_company_users (
            email TEXT PRIMARY KEY,
            deleted_at TEXT
        )
    ''')
    cur.execute('''
        CREATE TABLE IF NOT EXISTS company_projects (
            site_id TEXT PRIMARY KEY,
            site_name TEXT,
            location TEXT,
            client_name TEXT,
            client_email TEXT,
            engineer_email TEXT,
            engineer_name TEXT,
            total_contract_amount REAL,
            advance_received REAL,
            payments_json TEXT,
            status TEXT,
            created_at TEXT
        )
    ''')
    cur.execute('''
        CREATE TABLE IF NOT EXISTS deleted_company_projects (
            site_id TEXT PRIMARY KEY,
            deleted_at TEXT
        )
    ''')
    conn.commit()
    conn.close()

init_db()

def get_deleted_user_emails():
    deleted = set()
    try:
        conn = get_db_connection()
        rows = conn.execute("SELECT email FROM deleted_company_users").fetchall()
        for r in rows:
            deleted.add(r["email"].strip().lower())
        conn.close()
    except Exception as e:
        print("DB read deleted users error:", e)

    if os.path.exists(DELETED_USERS_FILE):
        try:
            with open(DELETED_USERS_FILE, "r", encoding="utf-8") as f:
                d_list = json.load(f)
                if isinstance(d_list, list):
                    for em in d_list:
                        deleted.add(str(em).strip().lower())
        except Exception:
            pass
    return deleted

def mark_user_deleted(email):
    em = normalize_email(email).lower()
    if not em:
        return
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("INSERT OR REPLACE INTO deleted_company_users (email, deleted_at) VALUES (?, ?)", (em, time.strftime("%Y-%m-%d %H:%M:%S")))
        cur.execute("DELETE FROM company_users WHERE lower(email) = ?", (em,))
        conn.commit()
        conn.close()
    except Exception as e:
        print("DB mark deleted error:", e)

    try:
        del_set = get_deleted_user_emails()
        del_set.add(em)
        atomic_save_json(DELETED_USERS_FILE, sorted(list(del_set)))
    except Exception:
        pass

def unmark_user_deleted(email):
    em = normalize_email(email).lower()
    if not em:
        return
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("DELETE FROM deleted_company_users WHERE lower(email) = ?", (em,))
        conn.commit()
        conn.close()
    except Exception as e:
        print("DB unmark deleted error:", e)

    try:
        del_set = get_deleted_user_emails()
        if em in del_set:
            del_set.remove(em)
            atomic_save_json(DELETED_USERS_FILE, sorted(list(del_set)))
    except Exception:
        pass

def get_deleted_project_ids():
    deleted = set()
    try:
        conn = get_db_connection()
        rows = conn.execute("SELECT site_id FROM deleted_company_projects").fetchall()
        for r in rows:
            deleted.add(r["site_id"].strip().upper())
        conn.close()
    except Exception as e:
        print("DB read deleted projects error:", e)

    if os.path.exists(DELETED_PROJECTS_FILE):
        try:
            with open(DELETED_PROJECTS_FILE, "r", encoding="utf-8") as f:
                d_list = json.load(f)
                if isinstance(d_list, list):
                    for sid in d_list:
                        deleted.add(str(sid).strip().upper())
        except Exception:
            pass
    return deleted

def mark_project_deleted(site_id):
    sid = str(site_id).strip().upper()
    if not sid:
        return
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("INSERT OR REPLACE INTO deleted_company_projects (site_id, deleted_at) VALUES (?, ?)", (sid, time.strftime("%Y-%m-%d %H:%M:%S")))
        cur.execute("DELETE FROM company_projects WHERE upper(site_id) = ?", (sid,))
        conn.commit()
        conn.close()
    except Exception as e:
        print("DB mark project deleted error:", e)

    try:
        del_set = get_deleted_project_ids()
        del_set.add(sid)
        atomic_save_json(DELETED_PROJECTS_FILE, sorted(list(del_set)))
    except Exception:
        pass

def unmark_project_deleted(site_id):
    sid = str(site_id).strip().upper()
    if not sid:
        return
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("DELETE FROM deleted_company_projects WHERE upper(site_id) = ?", (sid,))
        conn.commit()
        conn.close()
    except Exception as e:
        print("DB unmark project deleted error:", e)

    try:
        del_set = get_deleted_project_ids()
        if sid in del_set:
            del_set.remove(sid)
            atomic_save_json(DELETED_PROJECTS_FILE, sorted(list(del_set)))
    except Exception:
        pass

init_db()

app = Flask(__name__, static_folder=None)
CORS(app)

init_excel()

DEFAULT_COMPANY_USERS = {
    "alex@building.com": {
        "email": "alex@building.com",
        "name": "Alex (Company Owner)",
        "role": "owner",
        "password": "123",
        "status": "active",
        "last_active": time.strftime("%Y-%m-%d %H:%M")
    },
    "samuveldavidkumar@gmail.com": {
        "email": "samuveldavidkumar@gmail.com",
        "name": "Samuvel (Company Owner)",
        "role": "owner",
        "password": "123",
        "status": "active",
        "last_active": time.strftime("%Y-%m-%d %H:%M")
    },
    "sam@building.com": {
        "email": "sam@building.com",
        "name": "Sam (Site Engineer)",
        "role": "builder",
        "password": "123",
        "status": "active",
        "last_active": time.strftime("%Y-%m-%d %H:%M")
    },
    "guna@building.com": {
        "email": "guna@building.com",
        "name": "Guna (Site Engineer)",
        "role": "builder",
        "password": "123",
        "status": "active",
        "last_active": time.strftime("%Y-%m-%d %H:%M")
    },
    "stephen@building.com": {
        "email": "stephen@building.com",
        "name": "Stephen (Site Engineer)",
        "role": "builder",
        "password": "123",
        "status": "active",
        "last_active": time.strftime("%Y-%m-%d %H:%M")
    }
}

DEFAULT_PROJECTS = {
    "SITE-101": {
        "site_id": "SITE-101",
        "site_name": "Villa Grand Residency - Phase 1",
        "location": "North Sector Road, Plot #42",
        "client_name": "Mr. Sharma & Family",
        "client_email": "sharma@client.com",
        "engineer_email": "sam@building.com",
        "engineer_name": "Sam (Site Engineer)",
        "total_contract_amount": 1500000.0,
        "advance_received": 600000.0,
        "payments": [
            {
                "id": "PAY-001",
                "date": "2026-08-01",
                "amount": 300000.0,
                "mode": "Online Payment",
                "notes": "Initial Token Advance via NEFT / UPI"
            },
            {
                "id": "PAY-002",
                "date": "2026-08-08",
                "amount": 300000.0,
                "mode": "Cheque",
                "notes": "Cheque #409210 cleared"
            }
        ],
        "status": "In Progress",
        "created_at": "2026-08-01"
    },
    "SITE-102": {
        "site_id": "SITE-102",
        "site_name": "Sunrise Heights Tower - Block B",
        "location": "Ring Road Boulevard, Sector 9",
        "client_name": "Dr. Rajesh & Sunita Verma",
        "client_email": "verma@client.com",
        "engineer_email": "guna@building.com",
        "engineer_name": "Guna (Site Engineer)",
        "total_contract_amount": 2800000.0,
        "advance_received": 1200000.0,
        "payments": [
            {
                "id": "PAY-001",
                "date": "2026-08-10",
                "amount": 700000.0,
                "mode": "Online Payment",
                "notes": "Bank Transfer / RTGS"
            },
            {
                "id": "PAY-002",
                "date": "2026-08-14",
                "amount": 500000.0,
                "mode": "Cash",
                "notes": "Cash Deposit at Office"
            }
        ],
        "status": "In Progress",
        "created_at": "2026-08-10"
    },
    "SITE-103": {
        "site_id": "SITE-103",
        "site_name": "Greenfield Commercial Complex",
        "location": "Tech Park Main Highway",
        "client_name": "Apex Ventures Ltd",
        "client_email": "apex@client.com",
        "engineer_email": "stephen@building.com",
        "engineer_name": "Stephen (Site Engineer)",
        "total_contract_amount": 4500000.0,
        "advance_received": 1800000.0,
        "payments": [
            {
                "id": "PAY-001",
                "date": "2026-08-15",
                "amount": 1000000.0,
                "mode": "Online Payment",
                "notes": "Corporate Wire Transfer"
            },
            {
                "id": "PAY-002",
                "date": "2026-08-18",
                "amount": 800000.0,
                "mode": "Cheque",
                "notes": "HDFC Bank Cheque #992100"
            }
        ],
        "status": "Foundation Stage",
        "created_at": "2026-08-15"
    },
    "SITE-104": {
        "site_id": "SITE-104",
        "site_name": "naveen",
        "location": "tamabam",
        "client_name": "alex",
        "client_email": "naveen@building.com",
        "engineer_email": "naveen@building.com",
        "engineer_name": "naveen",
        "total_contract_amount": 8000000.0,
        "advance_received": 1600000.0,
        "payments": [
            {
                "id": "PAY-001",
                "date": "2026-08-23",
                "amount": 1600000.0,
                "mode": "Online Payment",
                "notes": "Initial Advance Transfer"
            }
        ],
        "status": "In Progress",
        "created_at": "2026-08-23"
    }
}

def normalize_email(email_raw):
    if not email_raw:
        return ""
    em = str(email_raw).strip().lower()
    if em in ["alex", "owner", "alex@builder.com", "alex@buildtrack.com"]:
        return "alex@building.com"
    if em in ["samuvel", "samuv", "samuveldavidkumar", "samuveldavidkumar@gmail.com"]:
        return "samuveldavidkumar@gmail.com"
    if em in ["sam", "sam@builder.com", "sam@buildtrack.com"]:
        return "sam@building.com"
    if em in ["guna", "guna@builder.com", "guna@buildtrack.com"]:
        return "guna@building.com"
    if em in ["stephen", "stephen@builder.com", "stephen@buildtrack.com"]:
        return "stephen@building.com"
    if "@" not in em:
        return f"{em}@building.com"
    return em

def atomic_save_json(filepath, data):
    """Safely and atomically writes JSON to disk using a temporary file to prevent race conditions."""
    tmp_path = f"{filepath}.tmp_{os.getpid()}_{time.time()}"
    try:
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
            f.flush()
            try:
                os.fsync(f.fileno())
            except Exception:
                pass
        if os.path.exists(filepath):
            os.replace(tmp_path, filepath)
        else:
            os.rename(tmp_path, filepath)
    except Exception as e:
        print(f"Error saving {filepath}:", e)
        try:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
        except Exception:
            pass

def load_users():
    with USERS_LOCK:
        users = {}
        deleted_set = get_deleted_user_emails()

        # 1. Load from SQLite Database (primary durable storage)
        try:
            conn = get_db_connection()
            rows = conn.execute("SELECT * FROM company_users").fetchall()
            for r in rows:
                em = r["email"]
                if em.lower() not in deleted_set:
                    users[em] = {
                        "email": em,
                        "name": r["name"],
                        "role": r["role"],
                        "password": r["password"],
                        "status": r["status"] or "active",
                        "last_active": r["last_active"] or "Never",
                        "created_at": r["created_at"] or time.strftime("%Y-%m-%d")
                    }
            conn.close()
        except Exception as e:
            print("DB read users error:", e)

        # 2. Merge from USERS_FILE if present
        if os.path.exists(USERS_FILE):
            for _ in range(3):
                try:
                    with open(USERS_FILE, "r", encoding="utf-8") as f:
                        file_data = json.load(f)
                        if isinstance(file_data, dict):
                            for k, v in file_data.items():
                                if k.lower() not in deleted_set and k not in users:
                                    users[k] = v
                    break
                except Exception:
                    time.sleep(0.05)

        # 3. Merge from USERS_BACKUP_FILE if present
        if os.path.exists(USERS_BACKUP_FILE):
            try:
                with open(USERS_BACKUP_FILE, "r", encoding="utf-8") as f:
                    bak_data = json.load(f)
                    if isinstance(bak_data, dict):
                        for k, v in bak_data.items():
                            if k.lower() not in deleted_set and k not in users:
                                users[k] = v
            except Exception:
                pass

        # 4. Merge from static/users.json if present
        static_users_file = os.path.join(STATIC_DIR, "users.json")
        if static_users_file != USERS_FILE and os.path.exists(static_users_file):
            try:
                with open(static_users_file, "r", encoding="utf-8") as f:
                    st_data = json.load(f)
                    if isinstance(st_data, dict):
                        for k, v in st_data.items():
                            if k.lower() not in deleted_set and k not in users:
                                users[k] = v
            except Exception:
                pass

        # 5. Only ensure DEFAULT_COMPANY_USERS exist IF THEY WERE NEVER DELETED!
        for k, v in DEFAULT_COMPANY_USERS.items():
            if k.lower() not in deleted_set and k not in users:
                users[k] = v

        # Final purge of any deleted accounts that might have slipped in
        for del_em in deleted_set:
            to_remove = [uk for uk in list(users.keys()) if uk.lower() == del_em]
            for uk in to_remove:
                del users[uk]

        return users

def save_users(users_dict):
    with USERS_LOCK:
        deleted_set = get_deleted_user_emails()
        # Ensure deleted users are completely filtered out
        users_dict = {k: v for k, v in users_dict.items() if k.lower() not in deleted_set}

        # 1. Persist to SQLite
        try:
            conn = get_db_connection()
            cur = conn.cursor()
            for em, u in users_dict.items():
                cur.execute('''
                    INSERT INTO company_users (email, name, role, password, status, last_active, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(email) DO UPDATE SET
                        name = excluded.name,
                        role = excluded.role,
                        password = excluded.password,
                        status = excluded.status,
                        last_active = excluded.last_active
                ''', (
                    em,
                    u.get("name", em),
                    u.get("role", "builder"),
                    u.get("password", "123"),
                    u.get("status", "active"),
                    u.get("last_active", "Never"),
                    u.get("created_at", time.strftime("%Y-%m-%d"))
                ))

            # Delete any user from DB that was removed from users_dict
            db_emails = [row["email"] for row in cur.execute("SELECT email FROM company_users").fetchall()]
            for dbe in db_emails:
                if dbe not in users_dict:
                    cur.execute("DELETE FROM company_users WHERE email = ?", (dbe,))

            conn.commit()
            conn.close()
        except Exception as e:
            print("DB save users error:", e)

        # 2. Atomic write to USERS_FILE
        atomic_save_json(USERS_FILE, users_dict)

        # 3. Atomic write to USERS_BACKUP_FILE
        atomic_save_json(USERS_BACKUP_FILE, users_dict)

        # 4. Atomic write to static/users.json if STATIC_DIR exists
        if STATIC_DIR and STATIC_DIR != BASE_DIR and os.path.isdir(STATIC_DIR):
            static_users_file = os.path.join(STATIC_DIR, "users.json")
            atomic_save_json(static_users_file, users_dict)

def load_projects():
    with PROJECTS_LOCK:
        projects = {}
        deleted_set = get_deleted_project_ids()

        # 1. Load from SQLite
        try:
            conn = get_db_connection()
            rows = conn.execute("SELECT * FROM company_projects").fetchall()
            for r in rows:
                sid = r["site_id"].strip().upper()
                if sid not in deleted_set:
                    pmts = []
                    if r["payments_json"]:
                        try:
                            pmts = json.loads(r["payments_json"])
                        except Exception:
                            pass
                    projects[sid] = {
                        "site_id": sid,
                        "site_name": r["site_name"],
                        "location": r["location"],
                        "client_name": r["client_name"],
                        "client_email": r["client_email"],
                        "engineer_email": r["engineer_email"],
                        "engineer_name": r["engineer_name"],
                        "total_contract_amount": float(r["total_contract_amount"] or 0),
                        "advance_received": float(r["advance_received"] or 0),
                        "payments": pmts,
                        "status": r["status"] or "In Progress",
                        "created_at": r["created_at"] or time.strftime("%Y-%m-%d")
                    }
            conn.close()
        except Exception as e:
            print("DB read projects error:", e)

        # 2. Merge from PROJECTS_FILE
        if os.path.exists(PROJECTS_FILE):
            for _ in range(3):
                try:
                    with open(PROJECTS_FILE, "r", encoding="utf-8") as f:
                        p_data = json.load(f)
                        if isinstance(p_data, dict):
                            for k, v in p_data.items():
                                k_upper = k.strip().upper()
                                if k_upper not in deleted_set and k_upper not in projects:
                                    projects[k_upper] = v
                    break
                except Exception:
                    time.sleep(0.05)

        # 3. Merge from PROJECTS_BACKUP_FILE
        if os.path.exists(PROJECTS_BACKUP_FILE):
            try:
                with open(PROJECTS_BACKUP_FILE, "r", encoding="utf-8") as f:
                    bak_data = json.load(f)
                    if isinstance(bak_data, dict):
                        for k, v in bak_data.items():
                            k_upper = k.strip().upper()
                            if k_upper not in deleted_set and k_upper not in projects:
                                projects[k_upper] = v
            except Exception:
                pass

        # 4. Merge from static/projects.json
        static_p_file = os.path.join(STATIC_DIR, "projects.json")
        if static_p_file != PROJECTS_FILE and os.path.exists(static_p_file):
            try:
                with open(static_p_file, "r", encoding="utf-8") as f:
                    st_data = json.load(f)
                    if isinstance(st_data, dict):
                        for k, v in st_data.items():
                            k_upper = k.strip().upper()
                            if k_upper not in deleted_set and k_upper not in projects:
                                projects[k_upper] = v
            except Exception:
                pass

        # 5. Only ensure DEFAULT_PROJECTS exist IF NEVER DELETED and system is brand new
        if not projects and not deleted_set:
            projects = dict(DEFAULT_PROJECTS)

        # Purge any deleted projects
        for del_sid in deleted_set:
            to_del = [pk for pk in list(projects.keys()) if pk.strip().upper() == del_sid]
            for pk in to_del:
                del projects[pk]

        # Ensure payments array & advance_received are consistent
        for sid, p in projects.items():
            if "payments" not in p or not isinstance(p["payments"], list):
                p["payments"] = []
                adv = float(p.get("advance_received", 0))
                if adv > 0:
                    p["payments"].append({
                        "id": "PAY-001",
                        "date": p.get("created_at") or time.strftime("%Y-%m-%d"),
                        "amount": adv,
                        "mode": "Online Payment",
                        "notes": "Initial Advance Received"
                    })
            elif p["payments"]:
                p["advance_received"] = sum(float(x.get("amount", 0)) for x in p["payments"])

        return projects

def save_projects(projects_dict):
    with PROJECTS_LOCK:
        deleted_set = get_deleted_project_ids()
        # Clean out any deleted projects
        projects_dict = {k.strip().upper(): v for k, v in projects_dict.items() if k.strip().upper() not in deleted_set}

        # 1. Persist to SQLite
        try:
            conn = get_db_connection()
            cur = conn.cursor()
            for sid, p in projects_dict.items():
                cur.execute('''
                    INSERT INTO company_projects (
                        site_id, site_name, location, client_name, client_email,
                        engineer_email, engineer_name, total_contract_amount,
                        advance_received, payments_json, status, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(site_id) DO UPDATE SET
                        site_name = excluded.site_name,
                        location = excluded.location,
                        client_name = excluded.client_name,
                        client_email = excluded.client_email,
                        engineer_email = excluded.engineer_email,
                        engineer_name = excluded.engineer_name,
                        total_contract_amount = excluded.total_contract_amount,
                        advance_received = excluded.advance_received,
                        payments_json = excluded.payments_json,
                        status = excluded.status
                ''', (
                    sid,
                    p.get("site_name", sid),
                    p.get("location", ""),
                    p.get("client_name", ""),
                    p.get("client_email", ""),
                    p.get("engineer_email", ""),
                    p.get("engineer_name", ""),
                    float(p.get("total_contract_amount", 0)),
                    float(p.get("advance_received", 0)),
                    json.dumps(p.get("payments", []), ensure_ascii=False),
                    p.get("status", "In Progress"),
                    p.get("created_at", time.strftime("%Y-%m-%d"))
                ))

            # Delete any project from DB that was removed
            db_sids = [row["site_id"] for row in cur.execute("SELECT site_id FROM company_projects").fetchall()]
            for dbs in db_sids:
                if dbs not in projects_dict:
                    cur.execute("DELETE FROM company_projects WHERE site_id = ?", (dbs,))

            conn.commit()
            conn.close()
        except Exception as e:
            print("DB save projects error:", e)

        # 2. Atomic writes
        atomic_save_json(PROJECTS_FILE, projects_dict)
        atomic_save_json(PROJECTS_BACKUP_FILE, projects_dict)
        if STATIC_DIR and STATIC_DIR != BASE_DIR and os.path.isdir(STATIC_DIR):
            atomic_save_json(os.path.join(STATIC_DIR, "projects.json"), projects_dict)

# Initial load and backup sync
init_db()
_initial_users = load_users()
save_users(_initial_users)
_initial_projects = load_projects()
save_projects(_initial_projects)

def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

def serve_file(filename):
    if os.path.exists(os.path.join(STATIC_DIR, filename)):
        resp = send_from_directory(STATIC_DIR, filename)
    elif os.path.exists(os.path.join(BASE_DIR, filename)):
        resp = send_from_directory(BASE_DIR, filename)
    elif os.path.exists(os.path.join(UPLOADS_DIR, filename)):
        resp = send_from_directory(UPLOADS_DIR, filename)
    elif filename.startswith("image_") or filename.startswith("bg_") or filename.endswith(".jpg") or filename.endswith(".png"):
        return redirect("https://images.unsplash.com/photo-1590381105924-c72589b9ef3f?auto=format&fit=crop&w=1920&q=80")
    else:
        return f"File {filename} not found", 404

    resp.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    resp.headers["Pragma"] = "no-cache"
    resp.headers["Expires"] = "0"
    return resp

@app.after_request
def add_cache_headers(response):
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response

@app.route("/")
@app.route("/index")
@app.route("/index.html")
@app.route("/owner")
@app.route("/builder")
def company_portal():
    return serve_file("index.html")

@app.route("/client")
@app.route("/client.html")
def client_portal():
    return serve_file("client.html")

@app.route("/uploads/<path:filename>")
def get_upload(filename):
    return send_from_directory(UPLOADS_DIR, filename)

@app.route("/<path:filename>")
def static_proxy(filename):
    return serve_file(filename)

# -------------------------------------------------------------
# PHOTO UPLOAD & CAPTURE API
# -------------------------------------------------------------
@app.route("/api/upload-photo", methods=["POST"])
def upload_photo():
    try:
        data = request.json or {}
        img_str = data.get("image") or data.get("photo")
        if not img_str:
            return jsonify({"success": False, "error": "No image data received."}), 400

        if "," in img_str:
            img_str = img_str.split(",", 1)[1]

        img_bytes = base64.b64decode(img_str)
        filename = f"site_photo_{int(time.time() * 1000)}.jpg"
        file_path = os.path.join(UPLOADS_DIR, filename)
        with open(file_path, "wb") as f:
            f.write(img_bytes)

        photo_url = f"/uploads/{filename}"
        return jsonify({
            "success": True,
            "filename": filename,
            "url": photo_url,
            "message": "Site photo captured and saved successfully."
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

# -------------------------------------------------------------
# MULTI-SITE / PROJECT MANAGEMENT APIS
# -------------------------------------------------------------
@app.route("/api/projects", methods=["GET", "POST"])
def manage_projects():
    projects = load_projects()
    users = load_users()

    if request.method == "POST":
        data = request.json or {}
        site_name = str(data.get("site_name", "")).strip()
        site_id = str(data.get("site_id", "")).strip().upper()
        if not site_id:
            site_id = f"SITE-{len(projects) + 101}"

        if not site_name:
            return jsonify({"success": False, "error": "Construction Site Name is required."}), 400

        engineer_email = normalize_email(data.get("engineer_email", ""))
        engineer_name = str(data.get("engineer_name", "")).strip()
        engineer_password = str(data.get("engineer_password", "123")).strip() or "123"

        if engineer_email:
            if engineer_email not in users:
                users[engineer_email] = {
                    "email": engineer_email,
                    "name": engineer_name or engineer_email.split("@")[0].title() + " (Site Engineer)",
                    "role": "builder",
                    "password": engineer_password,
                    "status": "active",
                    "last_active": "Never"
                }
                save_users(users)
            elif engineer_name and engineer_email in users:
                users[engineer_email]["name"] = engineer_name
                save_users(users)

        total_amount = float(data.get("total_contract_amount") or 1500000.0)
        advance = float(data.get("advance_received") or 600000.0)
        initial_pay_mode = str(data.get("payment_mode") or "Online Payment").strip()
        if initial_pay_mode not in ["Cash", "Online Payment", "Cheque"]:
            initial_pay_mode = "Online Payment"

        client_name = str(data.get("client_name", "Client")).strip()
        client_email = str(data.get("client_email", "")).strip().lower()
        location = str(data.get("location", "Site Address")).strip()

        assigned_eng_name = engineer_name or users.get(engineer_email, {}).get("name", "Site Engineer")

        initial_payments = []
        if advance > 0:
            initial_payments.append({
                "id": "PAY-001",
                "date": time.strftime("%Y-%m-%d"),
                "amount": advance,
                "mode": initial_pay_mode,
                "notes": "Initial Advance Received"
            })

        unmark_project_deleted(site_id)
        projects[site_id] = {
            "site_id": site_id,
            "site_name": site_name,
            "location": location,
            "client_name": client_name,
            "client_email": client_email,
            "engineer_email": engineer_email or "sam@building.com",
            "engineer_name": assigned_eng_name,
            "total_contract_amount": total_amount,
            "advance_received": advance,
            "payments": initial_payments,
            "status": "In Progress",
            "created_at": time.strftime("%Y-%m-%d")
        }
        save_projects(projects)

        return jsonify({
            "success": True,
            "message": f"Construction site '{site_name}' ({site_id}) registered successfully for Engineer {assigned_eng_name}.",
            "project": projects[site_id]
        }), 201

    engineer_filter = normalize_email(request.args.get("engineer", ""))
    project_list = list(projects.values())
    if engineer_filter and engineer_filter not in ["alex@building.com", "all", "owner"]:
        project_list = [p for p in project_list if normalize_email(p.get("engineer_email", "")) == engineer_filter]

    return jsonify({"success": True, "projects": project_list})

@app.route("/api/projects/<site_id>", methods=["GET", "PUT", "DELETE"])
def single_project(site_id):
    site_id = site_id.strip().upper()
    projects = load_projects()

    if request.method == "DELETE":
        # 1. Permanently tombstone in DB and JSON
        mark_project_deleted(site_id)
        target_k = None
        for k in projects:
            if k.strip().upper() == site_id:
                target_k = k
                break
        if target_k:
            del projects[target_k]
        save_projects(projects)

        # 2. Clean Excel data, project sheet, and cached report
        try:
            excel_manager.delete_site_data(site_id)
        except Exception as e:
            print(f"Error cleaning Excel for site {site_id}:", e)

        return jsonify({"success": True, "message": f"Site {site_id} deleted permanently."})

    if site_id not in projects:
        return jsonify({"success": False, "error": f"Site {site_id} not found."}), 404

    if request.method == "GET":
        return jsonify({"success": True, "project": projects[site_id]})

    if request.method == "PUT":
        data = request.json or {}
        p = projects[site_id]
        if "site_name" in data: p["site_name"] = str(data["site_name"]).strip()
        if "location" in data: p["location"] = str(data["location"]).strip()
        if "client_name" in data: p["client_name"] = str(data["client_name"]).strip()
        if "client_email" in data: p["client_email"] = str(data["client_email"]).strip().lower()
        if "engineer_email" in data:
            p["engineer_email"] = normalize_email(data["engineer_email"])
            users = load_users()
            if p["engineer_email"] in users:
                p["engineer_name"] = users[p["engineer_email"]].get("name", p["engineer_email"])
        if "total_contract_amount" in data: p["total_contract_amount"] = float(data["total_contract_amount"])
        if "advance_received" in data: p["advance_received"] = float(data["advance_received"])
        if "status" in data: p["status"] = str(data["status"]).strip()

        projects[site_id] = p
        save_projects(projects)
        return jsonify({"success": True, "message": f"Site {site_id} updated.", "project": p})

# -------------------------------------------------------------
# CLIENT PAYMENTS MANAGEMENT APIS (CASH, ONLINE, CHEQUE)
# -------------------------------------------------------------
@app.route("/api/projects/<site_id>/payments", methods=["GET", "POST"])
def project_payments(site_id):
    site_id = site_id.strip().upper()
    projects = load_projects()
    if site_id not in projects:
        return jsonify({"success": False, "error": f"Site {site_id} not found."}), 404

    proj = projects[site_id]
    if "payments" not in proj or not isinstance(proj["payments"], list):
        proj["payments"] = []
        adv = float(proj.get("advance_received", 0))
        if adv > 0:
            proj["payments"].append({
                "id": "PAY-001",
                "date": proj.get("created_at") or time.strftime("%Y-%m-%d"),
                "amount": adv,
                "mode": "Online Payment",
                "notes": "Initial Advance Received"
            })
            save_projects(projects)

    if request.method == "GET":
        total_p = sum(float(p.get("amount", 0)) for p in proj["payments"])
        by_mode = {"Cash": 0.0, "Online Payment": 0.0, "Cheque": 0.0}
        for p in proj["payments"]:
            m = p.get("mode", "Cash")
            if m not in by_mode:
                by_mode[m] = 0.0
            by_mode[m] += float(p.get("amount", 0))

        return jsonify({
            "success": True,
            "site_id": site_id,
            "payments": proj["payments"],
            "total_payments": total_p,
            "by_mode": by_mode
        })

    if request.method == "POST":
        data = request.json or {}
        try:
            amount = float(data.get("amount", 0))
        except (ValueError, TypeError):
            return jsonify({"success": False, "error": "Valid payment amount is required."}), 400

        if amount <= 0:
            return jsonify({"success": False, "error": "Payment amount must be greater than 0."}), 400

        mode = str(data.get("mode", "Online Payment")).strip()
        if mode not in ["Cash", "Online Payment", "Cheque"]:
            mode = "Online Payment"

        date_str = str(data.get("date", time.strftime("%Y-%m-%d"))).strip() or time.strftime("%Y-%m-%d")
        notes = str(data.get("notes", "")).strip()

        existing_ids = [int(p["id"].split("-")[-1]) for p in proj["payments"] if p.get("id", "").startswith("PAY-") and p.get("id", "").split("-")[-1].isdigit()]
        next_num = (max(existing_ids) + 1) if existing_ids else (len(proj["payments"]) + 1)
        pay_id = f"PAY-{next_num:03d}"

        new_pay = {
            "id": pay_id,
            "date": date_str,
            "amount": amount,
            "mode": mode,
            "notes": notes
        }
        proj["payments"].append(new_pay)
        proj["advance_received"] = sum(float(p.get("amount", 0)) for p in proj["payments"])
        projects[site_id] = proj
        save_projects(projects)

        return jsonify({
            "success": True,
            "message": f"Payment {pay_id} ({mode}: Rs. {amount:,.2f}) recorded successfully.",
            "payment": new_pay,
            "payments": proj["payments"],
            "advance_received": proj["advance_received"]
        }), 201

@app.route("/api/projects/<site_id>/payments/<payment_id>", methods=["PUT", "DELETE"])
def single_project_payment(site_id, payment_id):
    site_id = site_id.strip().upper()
    payment_id = payment_id.strip().upper()
    projects = load_projects()
    if site_id not in projects:
        return jsonify({"success": False, "error": f"Site {site_id} not found."}), 404

    proj = projects[site_id]
    payments = proj.get("payments", [])
    target_idx = next((i for i, p in enumerate(payments) if p.get("id", "").upper() == payment_id), None)
    if target_idx is None:
        return jsonify({"success": False, "error": f"Payment {payment_id} not found."}), 404

    if request.method == "PUT":
        data = request.json or {}
        if "amount" in data:
            try:
                payments[target_idx]["amount"] = float(data["amount"])
            except (ValueError, TypeError):
                pass
        if "mode" in data:
            mode = str(data["mode"]).strip()
            if mode in ["Cash", "Online Payment", "Cheque"]:
                payments[target_idx]["mode"] = mode
        if "date" in data:
            payments[target_idx]["date"] = str(data["date"]).strip()
        if "notes" in data:
            payments[target_idx]["notes"] = str(data["notes"]).strip()

        proj["payments"] = payments
        proj["advance_received"] = sum(float(p.get("amount", 0)) for p in payments)
        projects[site_id] = proj
        save_projects(projects)

        return jsonify({
            "success": True,
            "message": f"Payment {payment_id} updated.",
            "payment": payments[target_idx],
            "payments": proj["payments"],
            "advance_received": proj["advance_received"]
        })

    if request.method == "DELETE":
        del payments[target_idx]
        proj["payments"] = payments
        proj["advance_received"] = sum(float(p.get("amount", 0)) for p in payments)
        projects[site_id] = proj
        save_projects(projects)

        return jsonify({
            "success": True,
            "message": f"Payment {payment_id} deleted.",
            "payments": proj["payments"],
            "advance_received": proj["advance_received"]
        })

# -------------------------------------------------------------
# AUTHENTICATION & LOGIN
# -------------------------------------------------------------
@app.route("/api/auth/login", methods=["POST"])
def auth_login():
    data = request.json or {}
    email_raw = str(data.get("email", "")).strip()
    password = str(data.get("password", "")).strip()
    requested_role = str(data.get("role", "owner")).strip().lower()

    if not email_raw or not password:
        return jsonify({"success": False, "error": "Email and Password are required."}), 400

    email = normalize_email(email_raw)
    users = load_users()

    # Match by exact email or prefix
    if email not in users:
        found_key = None
        for k in users:
            if k.lower() == email.lower() or k.split("@")[0].lower() == email.split("@")[0].lower():
                found_key = k
                break
        if found_key:
            email = found_key

    if email not in users:
        return jsonify({
            "success": False,
            "error": f"Email '{email_raw}' is not registered. Please contact the Company Owner to authorize your account."
        }), 404

    user = users[email]
    actual_role = str(user.get("role", "builder")).strip().lower()

    # 1. ACCOUNT LOCK / STATUS CHECK
    if user.get("status") == "inactive":
        return jsonify({"success": False, "error": "Account is locked/disabled. Please contact the Company Owner."}), 403

    # 2. ROLE RESTRICTION ENFORCEMENT
    # If a Site Engineer tries to log in under Company Owner tab, explicitly deny with clear notification
    if actual_role == "builder" and requested_role == "owner":
        return jsonify({
            "success": False,
            "error": "Access Denied: This is a restricted Company Owner area. You are registered as a Site Engineer and cannot access the Owner Portal. Please select the 'Site Engineer' tab to log in."
        }), 403

    # 3. PASSWORD VALIDATION (Strict match against user's registered password)
    user_pwd = str(user.get("password", "")).strip() or "123"
    if password != user_pwd:
        return jsonify({
            "success": False,
            "error": "Incorrect password. Please enter the correct password for your account."
        }), 401

    # Login Successful
    user["last_active"] = time.strftime("%Y-%m-%d %H:%M")
    save_users(users)

    return jsonify({
        "success": True,
        "message": f"Welcome back, {user['name']}!",
        "user": {
            "email": user["email"],
            "name": user["name"],
            "role": actual_role
        }
    })

@app.route("/api/company/update-member-password", methods=["POST"])
def update_member_password():
    data = request.json or {}
    email_raw = str(data.get("email", "")).strip()
    new_password = str(data.get("new_password", "")).strip()

    if not email_raw or not new_password:
        return jsonify({"success": False, "error": "Email and New Password are required."}), 400

    email = normalize_email(email_raw)
    users = load_users()

    if email not in users:
        is_owner = (email == "alex@building.com")
        users[email] = {
            "email": email,
            "name": email.split("@")[0].title(),
            "role": "owner" if is_owner else "builder",
            "password": new_password,
            "status": "active",
            "last_active": "Never"
        }

    users[email]["password"] = new_password
    save_users(users)
    return jsonify({
        "success": True,
        "message": f"Password for {users[email]['name']} ({email}) updated successfully."
    })

@app.route("/api/company/users", methods=["GET", "POST"])
def manage_company_users():
    users = load_users()
    if request.method == "POST":
        data = request.json or {}
        new_email = normalize_email(data.get("email", ""))
        new_name = str(data.get("name", "")).strip()
        new_role = str(data.get("role", "builder")).strip().lower()
        new_password = str(data.get("password", "123")).strip() or "123"

        if not new_email or "@" not in new_email:
            return jsonify({"success": False, "error": "Valid company email is required."}), 400

        default_title = " (Company Owner)" if new_role == "owner" else " (Site Engineer)"
        unmark_user_deleted(new_email)
        users[new_email] = {
            "email": new_email,
            "name": new_name or (new_email.split("@")[0].title() + default_title),
            "role": new_role if new_role in ["owner", "builder"] else "builder",
            "password": new_password,
            "status": "active",
            "last_active": "Never",
            "created_at": time.strftime("%Y-%m-%d")
        }
        save_users(users)
        return jsonify({"success": True, "message": f"Authorized user {new_email} registered successfully as {new_role.upper()}."})

    safe_list = [{
        "email": v["email"],
        "name": v["name"],
        "role": v["role"],
        "status": v.get("status", "active"),
        "last_active": v.get("last_active", "Never"),
        "created_at": v.get("created_at", time.strftime("%Y-%m-%d"))
    } for v in users.values()]
    return jsonify({"success": True, "users": safe_list})

@app.route("/api/company/toggle-status", methods=["POST"])
def toggle_user_access_status():
    data = request.json or {}
    email = normalize_email(data.get("email", ""))

    users = load_users()
    if email not in users:
        return jsonify({"success": False, "error": "User not found."}), 404

    current_status = users[email].get("status", "active")
    new_status = "inactive" if current_status == "active" else "active"
    users[email]["status"] = new_status
    save_users(users)

    return jsonify({"success": True, "message": f"Access has been updated to {new_status.upper()}."})

@app.route("/api/company/users/<path:email>", methods=["DELETE"])
def remove_company_user(email):
    email = normalize_email(email)
    users = load_users()

    # Find the matching user (case-insensitive)
    target_key = None
    for k in users:
        if k.lower() == email.lower():
            target_key = k
            break

    # Permanently tombstone so default users, backups, and client caches NEVER restore it
    mark_user_deleted(email)
    if target_key:
        mark_user_deleted(target_key)
        del users[target_key]

    save_users(users)
    return jsonify({"success": True, "message": f"Account {email} permanently deleted."})

@app.route("/api/company/sync-accounts", methods=["POST"])
def sync_company_accounts():
    data = request.json or {}
    client_users = data.get("users") or []
    client_deleted = set(str(d).lower() for d in (data.get("deleted_users") or []))
    if not isinstance(client_users, list):
        return jsonify({"success": False, "error": "Invalid users payload."}), 400

    deleted_set = get_deleted_user_emails()
    for cd in client_deleted:
        mark_user_deleted(cd)
        deleted_set.add(cd.lower())

    users = load_users()
    added_count = 0
    for u in client_users:
        em = normalize_email(u.get("email", ""))
        if em and em not in users and em.lower() not in deleted_set and em.lower() not in client_deleted and "@" in em:
            role = u.get("role", "builder")
            default_title = " (Company Owner)" if role == "owner" else " (Site Engineer)"
            users[em] = {
                "email": em,
                "name": u.get("name") or (em.split("@")[0].title() + default_title),
                "role": role if role in ["owner", "builder"] else "builder",
                "password": u.get("password", "123") or "123",
                "status": u.get("status", "active"),
                "last_active": u.get("last_active", "Never"),
                "created_at": u.get("created_at", time.strftime("%Y-%m-%d"))
            }
            added_count += 1

    if added_count > 0:
        save_users(users)

    return jsonify({"success": True, "synced_count": added_count, "total_users": len(users)})

# -------------------------------------------------------------
# EXPENSES & STATS APIS (FILTERED BY SITE / ENGINEER)
# -------------------------------------------------------------
@app.route("/api/next-id", methods=["GET"])
def next_id_endpoint():
    site_param = request.args.get("site", "").strip()
    return jsonify({"next_id": get_next_id(site_id=site_param if site_param and site_param.lower() != "all" else None)})

@app.route("/api/data", methods=["GET"])
def get_data():
    site_param = request.args.get("site", "").strip()
    engineer_param = normalize_email(request.args.get("engineer", ""))
    
    projects = load_projects()
    if engineer_param and engineer_param not in ["alex@building.com", "all", "owner"]:
        matched_sites = [p["site_id"] for p in projects.values() if normalize_email(p.get("engineer_email", "")) == engineer_param]
        if matched_sites:
            site_param = matched_sites[0]

    records = get_all_records(site_filter=site_param if site_param and site_param.lower() != "all" else None)
    return jsonify({"success": True, "data": records, "count": len(records)})

@app.route("/api/entry", methods=["POST"])
def create_entry():
    data = request.json or {}
    try:
        new_record = add_record(data)
        return jsonify({
            "success": True,
            "message": f"Record {new_record['Expense ID']} saved successfully.",
            "record": new_record
        }), 201
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/api/entry/<expense_id>", methods=["DELETE"])
def remove_entry(expense_id):
    try:
        deleted = delete_record(expense_id)
        if deleted:
            return jsonify({"success": True, "message": f"Record {expense_id} deleted."})
        return jsonify({"success": False, "message": f"Record {expense_id} not found."}), 404
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/api/stats", methods=["GET"])
def get_stats():
    site_param = request.args.get("site", "").strip()
    engineer_param = normalize_email(request.args.get("engineer", ""))
    projects = load_projects()

    if engineer_param and engineer_param not in ["alex@building.com", "all", "owner"]:
        matched_sites = [p["site_id"] for p in projects.values() if normalize_email(p.get("engineer_email", "")) == engineer_param]
        if matched_sites:
            site_param = matched_sites[0]

    is_all = (not site_param or site_param.lower() == "all")
    records = get_all_records(site_filter=None if is_all else site_param)

    client_payments_list = []
    payments_by_mode = {"Cash": 0.0, "Online Payment": 0.0, "Cheque": 0.0}

    if is_all:
        total_project_amount = sum(float(p.get("total_contract_amount", 0)) for p in projects.values())
        advance_received = sum(float(p.get("advance_received", 0)) for p in projects.values())
        site_name = "All Construction Sites (Consolidated)"
        client_name = "Consolidated Clients"
        engineer_name = "All Site Engineers"
        for p in projects.values():
            for pay in p.get("payments", []):
                client_payments_list.append({**pay, "site_id": p.get("site_id"), "site_name": p.get("site_name")})
                m = pay.get("mode", "Online Payment")
                if m not in payments_by_mode: payments_by_mode[m] = 0.0
                payments_by_mode[m] += float(pay.get("amount", 0))
    else:
        proj = projects.get(site_param.upper()) or {}
        total_project_amount = float(proj.get("total_contract_amount", 1500000))
        advance_received = float(proj.get("advance_received", 600000))
        site_name = proj.get("site_name", site_param)
        client_name = proj.get("client_name", "Valued Client")
        engineer_name = proj.get("engineer_name", "Site Engineer")
        for pay in proj.get("payments", []):
            client_payments_list.append({**pay, "site_id": site_param, "site_name": site_name})
            m = pay.get("mode", "Online Payment")
            if m not in payments_by_mode: payments_by_mode[m] = 0.0
            payments_by_mode[m] += float(pay.get("amount", 0))

    total_expense = sum(float(r.get("Total Expense (INR)", 0)) for r in records)
    total_material_cost = sum(float(r.get("Material Cost (INR)", 0)) for r in records)
    total_labour_cost = sum(float(r.get("Labour Cost (INR)", 0)) for r in records)
    total_workers = sum(int(r.get("Number of Workers") or 0) for r in records)

    remaining_project_balance = max(total_project_amount - total_expense, 0.0)
    remaining_advance_balance = advance_received - total_expense

    expenses_by_mode = {"Cash": 0.0, "Online Payment": 0.0, "Cheque": 0.0}
    for r in records:
        e_mode = r.get("Payment Mode") or "Cash"
        if e_mode not in expenses_by_mode:
            expenses_by_mode[e_mode] = 0.0
        expenses_by_mode[e_mode] += float(r.get("Total Expense (INR)", 0))

    work_type_breakdown = {}
    for r in records:
        w_type = r.get("Labour/Work Type") or "General Site Work"
        if w_type not in work_type_breakdown:
            work_type_breakdown[w_type] = {
                "total_expense": 0.0,
                "material_cost": 0.0,
                "labour_cost": 0.0,
                "worker_count": 0,
                "entries": 0
            }
        work_type_breakdown[w_type]["total_expense"] += float(r.get("Total Expense (INR)", 0))
        work_type_breakdown[w_type]["material_cost"] += float(r.get("Material Cost (INR)", 0))
        work_type_breakdown[w_type]["labour_cost"] += float(r.get("Labour Cost (INR)", 0))
        try:
            work_type_breakdown[w_type]["worker_count"] += int(r.get("Number of Workers") or 0)
        except (ValueError, TypeError):
            pass
        work_type_breakdown[w_type]["entries"] += 1

    material_breakdown = {}
    for r in records:
        m_name = str(r.get("Material Name") or "").strip()
        if m_name and m_name != "-":
            if m_name not in material_breakdown:
                material_breakdown[m_name] = {"total_cost": 0.0, "total_quantity": 0.0, "unit": r.get("Unit") or ""}
            material_breakdown[m_name]["total_cost"] += float(r.get("Material Cost (INR)", 0))
            try:
                material_breakdown[m_name]["total_quantity"] += float(r.get("Quantity") or 0)
            except (ValueError, TypeError):
                pass

    date_breakdown = {}
    for r in sorted(records, key=lambda x: str(x.get("Date", ""))):
        d_val = str(r.get("Date", "Unknown"))
        if d_val not in date_breakdown:
            date_breakdown[d_val] = {"material_cost": 0.0, "labour_cost": 0.0, "total_expense": 0.0}
        date_breakdown[d_val]["material_cost"] += float(r.get("Material Cost (INR)", 0))
        date_breakdown[d_val]["labour_cost"] += float(r.get("Labour Cost (INR)", 0))
        date_breakdown[d_val]["total_expense"] += float(r.get("Total Expense (INR)", 0))

    return jsonify({
        "success": True,
        "site_id": site_param if not is_all else "ALL",
        "site_name": site_name,
        "client_name": client_name,
        "engineer_name": engineer_name,
        "summary": {
            "total_expense": total_expense,
            "total_material_cost": total_material_cost,
            "total_labour_cost": total_labour_cost,
            "total_workers": total_workers,
            "total_entries": len(records),
            "total_project_amount": total_project_amount,
            "advance_received": advance_received,
            "remaining_project_balance": remaining_project_balance,
            "remaining_advance_balance": remaining_advance_balance,
            "active_sites_count": len(projects)
        },
        "payments_received": {
            "total": advance_received,
            "by_mode": payments_by_mode,
            "list": client_payments_list
        },
        "expenses_by_mode": expenses_by_mode,
        "by_work_type": work_type_breakdown,
        "by_material": material_breakdown,
        "timeline": date_breakdown
    })

@app.route("/api/export", methods=["GET"])
def export_excel():
    site_param = request.args.get("site", "").strip()
    projects = load_projects()

    if site_param and site_param.lower() != "all" and site_param in projects:
        p_info = projects[site_param]
        records = get_all_records(site_filter=site_param)
        file_path = create_project_excel_file(site_param, p_info, records)
        return send_file(
            file_path,
            as_attachment=True,
            download_name=f"construction_expenses_{site_param}.xlsx",
            mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )

    sync_project_sheets()
    if os.path.exists(EXCEL_FILE):
        return send_file(
            EXCEL_FILE,
            as_attachment=True,
            download_name="construction_expenses_master.xlsx",
            mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
    return jsonify({"success": False, "error": "Excel file not found"}), 404

def open_browser_tab(url):
    import subprocess
    chrome_paths = [
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe")
    ]
    for chrome_exe in chrome_paths:
        if os.path.exists(chrome_exe):
            try:
                subprocess.Popen([chrome_exe, url])
                return
            except Exception:
                pass
    try:
        subprocess.Popen(f'start chrome "{url}"', shell=True)
    except Exception:
        try:
            webbrowser.open(url)
        except Exception:
            pass

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    local_ip = get_local_ip()
    url = f"http://127.0.0.1:{port}/"
    
    print("=" * 65)
    print("CONSTRUCTION EXPENSE AND MULTI-ENGINEER MANAGEMENT SYSTEM")
    print("=" * 65)
    print(f"Company Portal (Owner & Builders): http://127.0.0.1:{port}/")
    print(f"Client Verified Report URL:        http://127.0.0.1:{port}/client")
    print(f"Mobile Access (Same Wi-Fi):        http://{local_ip}:{port}/")
    print("=" * 65)

    threading.Timer(1.2, lambda: open_browser_tab(url)).start()
    app.run(host="0.0.0.0", port=port, debug=False)
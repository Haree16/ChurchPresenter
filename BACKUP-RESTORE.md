# Church Presenter — Data Safety, Backup & Disaster Recovery Guide

Church Presenter is built with a **Zero Data Loss Guarantee**. This guide explains the automated safety layers, manual backup workflows, database verification tools, and disaster recovery procedures.

---

## 1. Automated Safety Mechanisms

### 1.1 Automatic Pre-Migration Backups

Whenever Church Presenter updates to a newer software version containing database schema changes, the Rust backend executes an automatic file-level backup before applying any SQL migrations:
- **Backup File Pattern**: `<db_path>.pre-migration.<timestamp>.bak`
- **Retention Policy**: Keeps the 5 most recent pre-migration snapshots automatically; older snapshots are pruned to preserve disk space.
- **Rollback Guarantee**: If a migration fails during an upgrade, the original unmigrated file remains intact.

### 1.2 Automatic Pre-Restore Backups

Restoring a previous backup can be risky if done accidentally. Before any database restore operation overwrites the active database, the application takes an automatic snapshot:
- **Backup File Pattern**: `<db_path>.pre-restore.<timestamp>.bak`
- If you accidentally restore the wrong file, your previous data is immediately recoverable from this file.

### 1.3 Atomic Database Transactions

All multi-step modifications (such as importing a service playlist, generating song slides, or applying a database restore) execute inside an atomic SQLite transaction:
```sql
BEGIN TRANSACTION;
-- All tables updated or verified
COMMIT; -- Rolls back automatically on any error
```

---

## 2. Database Integrity Verification

Church Presenter provides a live diagnostic tool to verify the physical B-tree structure and index health of your SQLite database.

1. Open **Settings** (gear icon in the top header).
2. Select the **Storage & Database** tab.
3. Click **Verify Database Integrity**.
4. The backend executes `PRAGMA integrity_check;`:
   - If healthy, displays: `✅ Integrity Check Passed (OK)`.
   - If defects or orphaned rows exist, displays the exact SQLite error list.

---

## 3. Manual JSON Backup & Restore

### 3.1 Exporting a Full Backup

1. Click **Settings > Safety & Reset > Create Full Backup** (or click the **Backup** button in the header).
2. Click **Export Backup JSON**.
3. Choose a destination folder (such as a USB flash drive or cloud sync folder).
4. The resulting JSON file contains:
   - All worship songs and multi-stanza sections
   - Service playlists and scheduled items
   - Generated presentation slide decks
   - Custom typography and visual themes
   - Media asset metadata and dimensions
   - Hardware output configurations
   - Livestream overlay styling
   - MIDI controller note/CC mappings and OSC UDP configurations
   - Last saved workspace state

### 3.2 Credential Sanitization on Export

To prevent security compromises when sharing database backups among volunteers or email groups, all sensitive session tokens and authentication hashes in `remote_devices` are automatically sanitized to `"[SANITIZED]"` during export.

### 3.3 Restoring from a Backup File

1. Click **Backup** in the header.
2. Select **Restore Database from File**.
3. Choose the `.json` backup file.
4. The system validates the schema, takes an automatic `.pre-restore.*.bak` snapshot, imports all records atomically, and refreshes the operator workspace.

---

## 4. Physical Storage Paths

### Linux (Arch Linux, EndeavourOS, Ubuntu)
- **SQLite Database**: `~/.local/share/church-presenter/church_presenter.db`
- **Media Asset Directory**: `~/.local/share/church-presenter/media/`
- **Pre-Migration Backups**: `~/.local/share/church-presenter/church_presenter.db.pre-migration.*.bak`

### Windows (10 & 11)
- **SQLite Database**: `%APPDATA%\church-presenter\church_presenter.db`
- **Media Asset Directory**: `%APPDATA%\church-presenter\media\`
- **Pre-Migration Backups**: `%APPDATA%\church-presenter\church_presenter.db.pre-migration.*.bak`

---

## 5. Emergency Disaster Recovery Protocol

If an operating system crash, sudden power loss, or hardware failure corrupts the database:

1. Close **Church Presenter**.
2. Navigate to the physical database directory (see Section 4).
3. Locate the latest `.pre-migration.<timestamp>.bak` or `.pre-restore.<timestamp>.bak` file.
4. Rename `church_presenter.db` to `church_presenter.db.corrupt`.
5. Copy the `.bak` file and rename it to `church_presenter.db`.
6. Restart **Church Presenter**.
7. In **Settings > Storage & Database**, click **Verify Database Integrity** to confirm the recovered database is healthy.

# Plan: Dzēst visas atceltās aktivitātes

## Mērķis
Pilnībā izdzēst visus `crm.tasks` ierakstus ar `status = 'cancelled'` (917 rindas).

## Pašreizējais stāvoklis
- `cancelled`: **917**
- `planned`: 30
- `completed`: 2

Sadalījums pēc `cancelled_reason`:
- `phase2_mvp_cap_cleanup_20260520`: 443
- `NULL`: 381
- `phase2_1_ppv_quota_cleanup`: 91
- `Atzvanīja pats`: 1
- `f`: 1

## Soļi

### 1. Backup (drošībai)
Izveidot pilnu snapshot tabulu pirms dzēšanas:
```sql
CREATE TABLE crm._backup_tasks_cancelled_delete_20260521 AS
SELECT * FROM crm.tasks WHERE status = 'cancelled';
```

### 2. Dzēšana
```sql
DELETE FROM crm.tasks WHERE status = 'cancelled';
```
Sagaidāms: 917 rindas dzēstas.

### 3. Verifikācija
- `SELECT count(*) FROM crm.tasks WHERE status='cancelled'` → 0
- `SELECT count(*) FROM crm._backup_tasks_cancelled_delete_20260521` → 917
- Atlikušais `planned`=30, `completed`=2 nav mainīts

## Skar / neskar
- **Skar:** tikai `crm.tasks` (cancelled rindas)
- **Neskar:** planned/completed tasks, leads, communications, generator funkcija, cron, settings, UI

## Rollback
```sql
INSERT INTO crm.tasks SELECT * FROM crm._backup_tasks_cancelled_delete_20260521;
```

## Piezīme par audit/FK
Ja kādas tabulas (piem. `audit_events`, `communications`) atsaucas uz `crm.tasks.id` ar FK — pirms DELETE jāpārbauda. Ja nav FK, dzēšana ir tīra.

Pirms izpildes apstipriniet.
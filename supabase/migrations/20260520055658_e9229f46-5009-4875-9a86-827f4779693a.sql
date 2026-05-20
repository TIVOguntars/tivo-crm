DO $$
DECLARE
  v_owner_updated bigint;
  v_ppv_updated bigint;
  v_active_with_assignee bigint;
  v_active_missing bigint;
BEGIN
  -- 1. Backfill owner_user_id from public.leads.atbildigais
  WITH upd AS (
    UPDATE crm.leads cl
    SET owner_user_id = p.id,
        updated_at = now()
    FROM crm.contacts ct, public.leads pl, crm.profiles p
    WHERE cl.contact_id = ct.id
      AND pl.email_normalized = ct.email_normalized
      AND p.user_code = NULLIF(TRIM(pl.atbildigais), '')
      AND cl.owner_user_id IS NULL
    RETURNING cl.id
  )
  SELECT count(*) INTO v_owner_updated FROM upd;

  -- 2. Backfill ppv_user_id from public.leads.ppv_vards
  WITH upd AS (
    UPDATE crm.leads cl
    SET ppv_user_id = p.id,
        updated_at = now()
    FROM crm.contacts ct, public.leads pl, crm.profiles p
    WHERE cl.contact_id = ct.id
      AND pl.email_normalized = ct.email_normalized
      AND p.user_code = NULLIF(TRIM(pl.ppv_vards), '')
      AND cl.ppv_user_id IS NULL
    RETURNING cl.id
  )
  SELECT count(*) INTO v_ppv_updated FROM upd;

  -- 3. Post-backfill stats over active leads
  SELECT
    count(*) FILTER (WHERE COALESCE(owner_user_id, ppv_user_id) IS NOT NULL),
    count(*) FILTER (WHERE COALESCE(owner_user_id, ppv_user_id) IS NULL)
  INTO v_active_with_assignee, v_active_missing
  FROM crm.leads
  WHERE status IN ('Jauns','Piesaistīšana','Piedāvājums','Atlikts','Atkārtojas');

  RAISE NOTICE 'Backfill summary: owner_updated=%, ppv_updated=%, active_with_assignee=%, active_missing=%',
    v_owner_updated, v_ppv_updated, v_active_with_assignee, v_active_missing;
END $$;
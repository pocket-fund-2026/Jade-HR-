-- Local change journal and expiring write lease. Enabled only at cutover.
CREATE SCHEMA IF NOT EXISTS hr_ha;
REVOKE ALL ON SCHEMA hr_ha FROM PUBLIC;
CREATE TABLE IF NOT EXISTS hr_ha.lease(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), phase text NOT NULL DEFAULT 'bootstrap', epoch bigint NOT NULL DEFAULT 1, expires_at timestamptz NOT NULL DEFAULT '-infinity');
INSERT INTO hr_ha.lease(singleton) VALUES(true) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS hr_ha.outbox(id bigserial PRIMARY KEY, txid bigint NOT NULL, table_name text NOT NULL, operation text NOT NULL, old_key jsonb, row_data jsonb, created_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE INDEX IF NOT EXISTS hr_ha_outbox_txid ON hr_ha.outbox(txid,id);
CREATE OR REPLACE FUNCTION hr_ha.before_write() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,hr_ha AS $$
DECLARE lease hr_ha.lease%ROWTYPE;
BEGIN
 PERFORM pg_advisory_xact_lock(77201933);
 SELECT * INTO lease FROM hr_ha.lease WHERE singleton;
 IF lease.phase<>'bootstrap' AND (lease.phase<>'local' OR clock_timestamp()>=lease.expires_at) THEN
  RAISE EXCEPTION 'HR primary write lease expired; standby promotion may be in progress' USING ERRCODE='55000';
 END IF;
 RETURN NULL;
END $$;
CREATE OR REPLACE FUNCTION hr_ha.capture_row() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,hr_ha AS $$
DECLARE key jsonb; rowjson jsonb;
BEGIN
 IF TG_OP<>'INSERT' THEN
  SELECT jsonb_object_agg(a.attname,to_jsonb(OLD)->a.attname) INTO key FROM pg_index i JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=ANY(i.indkey) WHERE i.indrelid=TG_RELID AND i.indisprimary;
 END IF;
 IF TG_OP<>'DELETE' THEN rowjson=to_jsonb(NEW); END IF;
 INSERT INTO hr_ha.outbox(txid,table_name,operation,old_key,row_data) VALUES(txid_current(),TG_TABLE_NAME,TG_OP,key,rowjson);
 RETURN NULL;
END $$;
CREATE OR REPLACE FUNCTION public.hr_ha_pending(p_after bigint DEFAULT 0,p_limit integer DEFAULT 1000) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,hr_ha AS $$
 WITH first_page AS (SELECT id,txid FROM hr_ha.outbox WHERE id>p_after ORDER BY id LIMIT LEAST(GREATEST(p_limit,1),5000)), boundary AS (SELECT max(id) AS last_id FROM hr_ha.outbox WHERE txid=(SELECT txid FROM first_page ORDER BY id DESC LIMIT 1))
 SELECT coalesce(jsonb_agg(to_jsonb(o) ORDER BY id),'[]'::jsonb) FROM hr_ha.outbox o WHERE o.id>p_after AND o.id<=(SELECT last_id FROM boundary)
$$;
REVOKE ALL ON FUNCTION public.hr_ha_pending(bigint,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hr_ha_pending(bigint,integer) TO service_role;
CREATE OR REPLACE FUNCTION hr_ha.commit_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,hr_ha AS $$
DECLARE lease hr_ha.lease%ROWTYPE;
BEGIN
 SELECT * INTO lease FROM hr_ha.lease WHERE singleton;
 IF lease.phase<>'bootstrap' AND (lease.phase<>'local' OR clock_timestamp()>=lease.expires_at) THEN RAISE EXCEPTION 'HR write cannot commit after its lease expires' USING ERRCODE='55000'; END IF;
 RETURN NULL;
END $$;

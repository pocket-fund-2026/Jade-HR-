-- Cloud authority is a single locked row. Promotion is sticky; no automatic failback.
CREATE SCHEMA IF NOT EXISTS hr_ha;
REVOKE ALL ON SCHEMA hr_ha FROM PUBLIC;
CREATE TABLE IF NOT EXISTS hr_ha.control(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), active text NOT NULL DEFAULT 'local' CHECK(active IN ('local','supabase')), enabled boolean NOT NULL DEFAULT false, epoch bigint NOT NULL DEFAULT 1, lease_until timestamptz NOT NULL DEFAULT '-infinity', last_event bigint NOT NULL DEFAULT 0, documents_ready boolean NOT NULL DEFAULT false, updated_at timestamptz NOT NULL DEFAULT clock_timestamp());
INSERT INTO hr_ha.control(singleton) VALUES(true) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS hr_ha.allowed_tables(name text PRIMARY KEY,pk text[] NOT NULL);
CREATE OR REPLACE FUNCTION public.hr_ha_route(p_promote boolean DEFAULT true) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,hr_ha AS $$
DECLARE state hr_ha.control%ROWTYPE;
BEGIN
 SELECT * INTO state FROM hr_ha.control WHERE singleton FOR UPDATE;
 IF p_promote AND state.enabled AND state.active='local' AND state.documents_ready AND clock_timestamp()>state.lease_until+interval '10 seconds' THEN
  UPDATE hr_ha.control SET active='supabase',epoch=epoch+1,updated_at=clock_timestamp() WHERE singleton RETURNING * INTO state;
 END IF;
 RETURN to_jsonb(state)||jsonb_build_object('server_time',clock_timestamp());
END $$;
CREATE OR REPLACE FUNCTION public.hr_ha_renew(p_epoch bigint) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,hr_ha AS $$
DECLARE state hr_ha.control%ROWTYPE;
BEGIN
 SELECT * INTO state FROM hr_ha.control WHERE singleton FOR UPDATE;
 IF state.active<>'local' OR state.epoch<>p_epoch THEN RAISE EXCEPTION 'Local primary is fenced' USING ERRCODE='55000'; END IF;
 IF state.enabled AND clock_timestamp()>state.lease_until+interval '10 seconds' THEN RAISE EXCEPTION 'Expired lease requires guarded recovery' USING ERRCODE='55000'; END IF;
 UPDATE hr_ha.control SET lease_until=clock_timestamp()+interval '30 seconds',updated_at=clock_timestamp() WHERE singleton RETURNING * INTO state;
 RETURN to_jsonb(state)||jsonb_build_object('server_time',clock_timestamp());
END $$;
CREATE OR REPLACE FUNCTION hr_ha.cloud_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,hr_ha AS $$
DECLARE state hr_ha.control%ROWTYPE;
BEGIN
 IF current_setting('hr_ha.applying',true)='on' THEN RETURN NULL; END IF;
 SELECT * INTO state FROM hr_ha.control WHERE singleton FOR SHARE;
 IF NOT state.enabled OR state.active<>'supabase' THEN RAISE EXCEPTION 'Supabase is standby; application writes are fenced' USING ERRCODE='55000'; END IF;
 RETURN NULL;
END $$;
CREATE OR REPLACE FUNCTION public.hr_ha_apply(p_events jsonb,p_epoch bigint) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,hr_ha AS $$
DECLARE state hr_ha.control%ROWTYPE; event jsonb; pk text[]; cols text; changes text; predicate text; command text; relation regclass; event_id bigint; previous_id bigint; affected bigint; serial_name text; serial_last bigint;
BEGIN
 SELECT * INTO state FROM hr_ha.control WHERE singleton FOR UPDATE;
 IF state.active<>'local' OR state.epoch<>p_epoch THEN RAISE EXCEPTION 'Replication epoch is fenced' USING ERRCODE='55000'; END IF;
 PERFORM set_config('hr_ha.applying','on',true);
 previous_id=0;
 FOR event IN SELECT value FROM jsonb_array_elements(p_events) LOOP
  event_id=(event->>'id')::bigint;
  IF event_id<=previous_id THEN RAISE EXCEPTION 'Events must be strictly ordered'; END IF;
  previous_id=event_id;
  IF event_id<=state.last_event THEN CONTINUE; END IF;
  SELECT a.pk INTO pk FROM hr_ha.allowed_tables a WHERE name=event->>'table_name';
  IF pk IS NULL THEN RAISE EXCEPTION 'Table is not allowed for replication'; END IF;
  relation=to_regclass(format('public.%I',event->>'table_name'));
  SELECT string_agg(format('%I',attname),',' ORDER BY attnum), string_agg(format('%I=r.%I',attname,attname),',' ORDER BY attnum) INTO cols,changes FROM pg_attribute WHERE attrelid=relation AND attnum>0 AND NOT attisdropped AND attgenerated='';
  SELECT string_agg(format('t.%I=k.%I',v,v),' AND ') INTO predicate FROM unnest(pk) v;
  IF event->>'operation'='INSERT' THEN
   command=format('INSERT INTO %s (%s) SELECT %s FROM jsonb_populate_record(NULL::%s,$1) r',relation,cols,cols,relation);
   EXECUTE command USING event->'row_data';
  ELSIF event->>'operation'='UPDATE' THEN
   command=format('UPDATE %s t SET %s FROM jsonb_populate_record(NULL::%s,$1) r,jsonb_populate_record(NULL::%s,$2) k WHERE %s',relation,changes,relation,relation,predicate);
   EXECUTE command USING event->'row_data',event->'old_key';
   GET DIAGNOSTICS affected=ROW_COUNT;
   IF affected<>1 THEN RAISE EXCEPTION 'Replication update target missing for %',relation; END IF;
  ELSIF event->>'operation'='DELETE' THEN
   command=format('DELETE FROM %s t USING jsonb_populate_record(NULL::%s,$1) k WHERE %s',relation,relation,predicate);
   EXECUTE command USING event->'old_key';
  ELSE RAISE EXCEPTION 'Unsupported replication operation'; END IF;
  IF event->>'operation'='INSERT' AND (event->'row_data') ? 'id' THEN
   serial_name=pg_get_serial_sequence(relation::text,'id');
   IF serial_name IS NOT NULL THEN
    EXECUTE format('SELECT last_value FROM %s',serial_name::regclass) INTO serial_last;
    IF (event->'row_data'->>'id')::bigint>=serial_last THEN PERFORM setval(serial_name::regclass,(event->'row_data'->>'id')::bigint,true); END IF;
   END IF;
  END IF;
  state.last_event=event_id;
 END LOOP;
 UPDATE hr_ha.control SET last_event=state.last_event,updated_at=clock_timestamp() WHERE singleton;
 RETURN jsonb_build_object('last_event',state.last_event,'epoch',state.epoch);
END $$;
REVOKE ALL ON FUNCTION public.hr_ha_route(boolean),public.hr_ha_renew(bigint),public.hr_ha_apply(jsonb,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hr_ha_route(boolean),public.hr_ha_renew(bigint),public.hr_ha_apply(jsonb,bigint) TO service_role;
CREATE TABLE IF NOT EXISTS hr_ha.document_authorizations(object_key text PRIMARY KEY,epoch bigint NOT NULL,backend text NOT NULL,expires_at timestamptz NOT NULL);
CREATE OR REPLACE FUNCTION public.hr_ha_storage_authorize(p_epoch bigint,p_backend text,p_objects jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,hr_ha AS $$
DECLARE state hr_ha.control%ROWTYPE; v_key text;
BEGIN
 SELECT * INTO state FROM hr_ha.control WHERE singleton FOR SHARE;
 IF state.active<>p_backend OR state.epoch<>p_epoch THEN RAISE EXCEPTION 'Document writer is fenced' USING ERRCODE='55000'; END IF;
 FOR v_key IN SELECT jsonb_array_elements_text(p_objects) LOOP
  IF position('/' IN v_key)=0 OR v_key LIKE '%/../%' THEN RAISE EXCEPTION 'Invalid document key'; END IF;
  INSERT INTO hr_ha.document_authorizations VALUES(v_key,p_epoch,p_backend,clock_timestamp()+interval '120 seconds') ON CONFLICT(object_key) DO UPDATE SET epoch=excluded.epoch,backend=excluded.backend,expires_at=excluded.expires_at;
 END LOOP;
 RETURN jsonb_build_object('authorized',true);
END $$;
CREATE OR REPLACE FUNCTION hr_ha.storage_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,hr_ha AS $$
DECLARE state hr_ha.control%ROWTYPE; authz hr_ha.document_authorizations%ROWTYPE; v_key text;
BEGIN
 SELECT * INTO state FROM hr_ha.control WHERE singleton FOR SHARE;
 IF TG_OP='DELETE' THEN v_key=OLD.bucket_id||'/'||OLD.name; ELSE v_key=NEW.bucket_id||'/'||NEW.name; END IF;
 SELECT * INTO authz FROM hr_ha.document_authorizations WHERE hr_ha.document_authorizations.object_key=v_key;
 IF NOT FOUND OR authz.epoch<>state.epoch OR authz.backend<>state.active OR clock_timestamp()>=authz.expires_at THEN RAISE EXCEPTION 'Document mutation is not authorized by the active primary' USING ERRCODE='55000'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
REVOKE ALL ON FUNCTION public.hr_ha_storage_authorize(bigint,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hr_ha_storage_authorize(bigint,text,jsonb) TO service_role;

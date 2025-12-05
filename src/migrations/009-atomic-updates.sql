-- 009-atomic-updates.sql
-- Atomic updates for scores and votes

-- 1. Apply Score Change RPC (Atomic read-modify-write)
CREATE OR REPLACE FUNCTION public.apply_score_change(
  target_user_id TEXT,
  target_server_id TEXT,
  point_change INTEGER,
  reason TEXT,
  awarded_by_id TEXT,
  pending_vote_id INTEGER DEFAULT NULL,
  message_id TEXT DEFAULT NULL,
  channel_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  new_total INTEGER;
  user_exists BOOLEAN;
  result JSONB;
BEGIN
  -- Ensure user exists in users table
  INSERT INTO public.users (user_id) VALUES (target_user_id::bigint)
  ON CONFLICT (user_id) DO NOTHING;

  -- Update or Insert Score
  -- We use a simple UPSERT logic but with calculation for the update
  INSERT INTO public.scores (user_id, server_id, total_score, highest_score, lowest_score, total_awards_received, updated_at)
  VALUES (
    target_user_id::bigint,
    target_server_id::bigint,
    point_change,
    point_change, -- highest (initial)
    point_change, -- lowest (initial)
    1,            -- total_awards_received
    CURRENT_TIMESTAMP
  )
  ON CONFLICT (user_id, server_id) DO UPDATE
  SET
    total_score = scores.total_score + EXCLUDED.total_score, -- Add the change
    highest_score = GREATEST(scores.highest_score, scores.total_score + EXCLUDED.total_score),
    lowest_score = LEAST(scores.lowest_score, scores.total_score + EXCLUDED.total_score),
    total_awards_received = scores.total_awards_received + 1,
    updated_at = CURRENT_TIMESTAMP
  RETURNING total_score INTO new_total;

  -- Insert History
  INSERT INTO public.score_history (
    user_id, server_id, point_change, reason, awarded_by, vote_id, message_id, channel_id
  ) VALUES (
    target_user_id::bigint,
    target_server_id::bigint,
    point_change,
    reason,
    awarded_by_id::bigint,
    pending_vote_id,
    message_id::bigint,
    channel_id::bigint
  );

  -- Update Giver Stats (if applicable)
  IF point_change != 0 AND awarded_by_id IS NOT NULL THEN
    INSERT INTO public.scores (user_id, server_id, total_awards_given)
    VALUES (awarded_by_id::bigint, target_server_id::bigint, 1)
    ON CONFLICT (user_id, server_id) DO UPDATE
    SET total_awards_given = scores.total_awards_given + 1;
  END IF;

  result := jsonb_build_object(
    'user_id', target_user_id,
    'server_id', target_server_id,
    'total_score', new_total
  );

  RETURN result;
END;
$$;

-- 2. Trigger for Vote Counts
CREATE OR REPLACE FUNCTION public.update_pending_vote_counts()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target_vote_id INTEGER;
BEGIN
  IF (TG_OP = 'DELETE') THEN
    target_vote_id := OLD.pending_vote_id;
  ELSE
    target_vote_id := NEW.pending_vote_id;
  END IF;

  UPDATE public.pending_votes
  SET
    approve_count = (SELECT COUNT(*) FROM public.votes WHERE pending_vote_id = target_vote_id AND vote_type = 'approve'),
    reject_count = (SELECT COUNT(*) FROM public.votes WHERE pending_vote_id = target_vote_id AND vote_type = 'reject'),
    updated_at = CURRENT_TIMESTAMP
  WHERE id = target_vote_id;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trigger_update_vote_counts ON public.votes;
CREATE TRIGGER trigger_update_vote_counts
AFTER INSERT OR UPDATE OR DELETE ON public.votes
FOR EACH ROW EXECUTE FUNCTION public.update_pending_vote_counts();

-- 3. Get User Group Score
CREATE OR REPLACE FUNCTION public.get_user_group_score(target_user_id TEXT, sync_code TEXT)
RETURNS BIGINT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  total_score BIGINT;
BEGIN
  SELECT SUM(s.total_score)
  INTO total_score
  FROM public.scores s
  JOIN public.sync_group_members sgm ON s.server_id = sgm.server_id
  WHERE s.user_id = target_user_id::bigint
    AND sgm.sync_code = get_user_group_score.sync_code
    AND sgm.is_active = TRUE;

  RETURN COALESCE(total_score, 0);
END;
$$;

-- Update version
INSERT INTO public.schema_version (version, description)
VALUES (9, 'Atomic updates for scores and votes')
ON CONFLICT (version) DO UPDATE SET description = EXCLUDED.description;

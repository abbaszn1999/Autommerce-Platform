-- auth_user_has_password told the invite flow whether an invited person already
-- had a password. The invite flow stopped calling it, and nothing else does: no
-- function, policy, trigger or scheduled job. Its sibling auth_user_id_by_email
-- is still used and stays.
DROP FUNCTION IF EXISTS public.auth_user_has_password(uuid);

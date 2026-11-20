-- The old in-app Agent (the floating assistant that drove the screen) is gone.
-- Its conversation table was empty and nothing references it.
--
-- Kept on purpose: the 'assistant' value in credit_transactions_operation_check,
-- because past Agent charges still sit in the credit ledger as billing history.
DROP TABLE IF EXISTS public.assistant_conversations;

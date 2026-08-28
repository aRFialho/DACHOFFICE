DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM channel_fee_rule
    WHERE confidence <> 'ESTIMATED'
      OR (fee_mode = 'percentage' AND currency IS NOT NULL)
      OR (fee_mode = 'fixed' AND (currency IS NULL OR currency !~ '^[A-Z]{3}$'))
  ) THEN
    RAISE EXCEPTION 'channel_fee_rule contains rows incompatible with finance rule invariants';
  END IF;
END;
$$;

ALTER TABLE channel_fee_rule
  ADD CONSTRAINT channel_fee_rule_confidence_estimated_check
    CHECK (confidence = 'ESTIMATED'),
  ADD CONSTRAINT channel_fee_rule_currency_by_fee_mode_check
    CHECK (
      (fee_mode = 'percentage' AND currency IS NULL)
      OR (fee_mode = 'fixed' AND currency ~ '^[A-Z]{3}$')
    );

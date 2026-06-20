from canonicalizer.spend import SpendGate


def test_cap_blocks_after_budget_exhausted():
    gate = SpendGate(cap_usd=0.002, cost_per_call_usd=0.001)
    assert gate.can_spend()
    gate.record()
    assert gate.can_spend()          # 0.001 + 0.001 == 0.002, still within
    gate.record()
    assert not gate.can_spend()      # 0.002 spent, no room for another
    assert gate.spent_usd == 0.002
    assert gate.remaining_usd == 0.0


def test_zero_cap_blocks_immediately():
    gate = SpendGate(cap_usd=0.0, cost_per_call_usd=0.001)
    assert not gate.can_spend()

import math

from canonicalizer.recurring import RecurringDetector, Txn


def _m(merchant, dates, amount):
    return [Txn(id=f"{merchant}{i}", date=d, amount=amount, merchant=merchant) for i, d in enumerate(dates)]


MONTHLY = ["2026-01-10", "2026-02-10", "2026-03-10", "2026-04-10", "2026-05-10", "2026-06-10"]


def test_detects_monthly_recurring():
    rep = RecurringDetector().detect(_m("Netflix", MONTHLY, 649))
    s = next((x for x in rep.series if x.merchant == "Netflix"), None)
    assert s is not None
    assert s.cadence == "monthly"
    assert abs(s.amount - 649) < 1
    assert round(s.annualized) == 649 * 12 or abs(s.annualized - 649 * 12) < 700
    assert s.confidence > 0.6


def test_ignores_irregular_amounts_and_gaps():
    txns = _m("BigBasket", ["2026-01-08", "2026-02-19", "2026-03-05", "2026-04-22"], 0)
    for t, amt in zip(txns, [2480, 1310, 2980, 1899]):
        txns[txns.index(t)] = Txn(t.id, t.date, amt, merchant="BigBasket")
    rep = RecurringDetector().detect(txns)
    assert all(s.merchant != "BigBasket" for s in rep.series)  # no false recurring


def test_min_occurrences_not_recurring():
    rep = RecurringDetector().detect(_m("Uber", ["2026-02-06", "2026-04-13"], 230))
    assert all(s.merchant != "Uber" for s in rep.series)


def test_trial_to_paid():
    txns = [Txn("a0", "2026-03-20", 0, merchant="Audible")] + _m("Audible", ["2026-04-20", "2026-05-20", "2026-06-20"], 199)
    rep = RecurringDetector().detect(txns)
    assert any(a.type == "trial_to_paid" and a.merchant == "Audible" for a in rep.anomalies)
    assert any(s.merchant == "Audible" for s in rep.series)  # recurring after trial


def test_price_hike():
    txns = _m("Cult.fit", MONTHLY, 1500)
    txns[4] = Txn("Cult.fit4", txns[4].date, 1800, merchant="Cult.fit")
    txns[5] = Txn("Cult.fit5", txns[5].date, 1800, merchant="Cult.fit")
    rep = RecurringDetector().detect(txns)
    assert any(a.type == "price_hike" and a.merchant == "Cult.fit" for a in rep.anomalies)


def test_amount_spike():
    txns = _m("House Rent", MONTHLY, 20000)
    txns[4] = Txn("House Rent4", txns[4].date, 35000, merchant="House Rent")
    rep = RecurringDetector().detect(txns)
    assert any(a.type == "amount_spike" and a.merchant == "House Rent" for a in rep.anomalies)


def test_new_recurring_weekly():
    weekly = ["2026-06-01", "2026-06-08", "2026-06-15", "2026-06-22", "2026-06-29"]
    rep = RecurringDetector().detect(_m("QuickPass", weekly, 99))
    s = next((x for x in rep.series if x.merchant == "QuickPass"), None)
    assert s is not None and s.cadence == "weekly"
    assert any(a.type == "new_recurring" and a.merchant == "QuickPass" for a in rep.anomalies)


def test_malformed_date_does_not_crash_the_batch():
    txns = _m("Netflix", MONTHLY, 649) + [Txn("bad1", "not-a-date", 500, merchant="X"), Txn("bad2", "2026-02-30", 500, merchant="Y")]
    rep = RecurringDetector().detect(txns)  # must not raise
    assert any(s.merchant == "Netflix" for s in rep.series)


def test_non_finite_amounts_do_not_crash():
    txns = _m("Netflix", MONTHLY, 649)
    txns[2] = Txn("Netflix2", txns[2].date, float("inf"), merchant="Netflix")
    txns[3] = Txn("Netflix3", txns[3].date, float("nan"), merchant="Netflix")
    rep = RecurringDetector().detect(txns)  # must not raise on pstdev
    s = next((x for x in rep.series if x.merchant == "Netflix"), None)
    assert s is not None and math.isfinite(s.amount) and math.isfinite(s.annualized)


def test_negative_refund_is_not_a_trial():
    txns = [Txn("rf", "2026-03-20", -500, merchant="Netflix")] + _m("Netflix", ["2026-04-20", "2026-05-20", "2026-06-20"], 649)
    rep = RecurringDetector().detect(txns)
    assert not any(a.type == "trial_to_paid" for a in rep.anomalies)  # refund != free trial


def test_unstable_amounts_not_recurring_even_if_cadence_regular():
    # perfectly monthly cadence but wildly varying amounts -> NOT recurring.
    txns = _m("Erratic", MONTHLY, 0)
    for i, amt in enumerate([100, 900, 250, 1500, 80, 1200]):
        txns[i] = Txn(f"e{i}", txns[i].date, amt, merchant="Erratic")
    rep = RecurringDetector().detect(txns)
    assert all(s.merchant != "Erratic" for s in rep.series)


def test_category_propagates_on_preresolved_path():
    txns = [Txn(id=f"n{i}", date=d, amount=649, merchant="Netflix", category="OTT/Subscriptions") for i, d in enumerate(MONTHLY)]
    s = next((x for x in RecurringDetector().detect(txns).series if x.merchant == "Netflix"), None)
    assert s is not None and s.category == "OTT/Subscriptions"


def test_default_resolver_groups_unknown_by_normalized_key():
    # no explicit merchant -> resolver groups by normalized key
    txns = [Txn(id=f"x{i}", date=d, amount=99, raw="UPI/FITZONE GYM/local", merchant_hint="FITZONE GYM") for i, d in enumerate(MONTHLY)]
    rep = RecurringDetector().detect(txns)
    assert len(rep.series) == 1 and rep.series[0].occurrences == 6

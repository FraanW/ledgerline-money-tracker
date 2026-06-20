from canonicalizer.normalize import normalize


def test_strips_rails_and_digits_keeps_brand():
    n = normalize("UPI/BIGBAZAAR/groceries/HDFC0001234", "BIGBAZAAR")
    assert "BIGBAZAAR" in n.tokens
    assert "UPI" not in n.tokens          # rail word dropped
    assert "0001234" not in " ".join(n.tokens)


def test_extracts_brand_from_vpa_local_part():
    n = normalize("UPI/BLINKIT/blinkcommerce.rzp@axisb/Payment", "BLINKIT")
    assert "BLINKCOMMERCE" in n.tokens    # mined from the VPA local part
    assert "AXISB" not in n.tokens        # bank suffix dropped
    assert "RZP" not in n.tokens          # gateway hop dropped


def test_drops_pure_digit_runs_and_cities():
    n = normalize("POS 5994 RELIANCE FRESH MUM 4521")
    assert "RELIANCE" in n.tokens and "FRESH" in n.tokens
    assert "5994" not in n.tokens and "4521" not in n.tokens
    assert "MUM" not in n.tokens          # city code dropped
    assert "POS" not in n.tokens


def test_atm_brand_words_survive():
    # ATM/WDL/NFS are the "merchant" for cash withdrawals — must not be stripped.
    n = normalize("ATM WDL HDFC ATM CONNAUGHT PL DEL 5000", "ATM WDL")
    assert "ATM" in n.tokens and "WDL" in n.tokens


def test_pure_noise_yields_no_tokens_without_crashing():
    n = normalize("/// *** ::: ")
    assert n.tokens == ()   # nothing to canonicalize -> pipeline will abstain

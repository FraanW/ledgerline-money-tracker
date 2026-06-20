"""The deterministic normalization floor.

Bank/UPI/card strings are noisy: rail prefixes (UPI/POS/NEFT/ACH), VPA handles
(`name.rzp@axisb`), gateway tokens (RAZORPAY/BILLDESK), legal-entity tails
(PVT LTD / INNOVATIVE RETAIL), city codes, ref/pincode digit runs. We strip the
clearly-generic noise while PRESERVING brand words, then emit a clean string +
a token list for both rule-matching and embedding.

Conservative on purpose: the stoplist holds only rail/instrument/entity/city
filler — never domain nouns that are part of a brand (POWER, OIL, FRESH, GAS,
LIFE, HEALTH, METRO, FIT...). A leftover word can't cause a *wrong* match (the
matcher needs a full alias to hit); over-stripping a brand word *would*. So we
err toward keeping tokens.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

# VPA bank/gateway suffixes (the part after @, plus gateway hops in the local part).
_VPA_SUFFIX = {
    "ybl", "okhdfcbank", "okaxis", "oksbi", "okicici", "paytm", "apl", "axisb",
    "axis", "icici", "hdfc", "sbi", "ibl", "upi", "kotak", "yapl", "jupiteraxis",
    "fbl", "barodampay", "pockets", "ptyes", "ptaxis", "ptsbi",
    # payment gateways that also appear as a `.rzp`-style hop in the local part
    "rzp", "razorpay", "billdesk", "bd", "payu", "ccavenue", "citruspay", "juspay",
}

# Clearly-generic noise — rails, instruments, entity tails, cities, filler.
# NOT here: any word that forms part of a real brand token.
_STOP = {
    # rails / instruments / actions
    "UPI", "P2M", "P2P", "POS", "NEFT", "IMPS", "RTGS", "ACH", "NACH", "MANDATE",
    "PG", "QR", "RECHARGE", "RECHG", "BILLPAY",
    "PAYMENT", "PAY", "ORDER", "FROM", "TO", "PH", "ONLINE", "TXN", "TRANSACTION",
    "REF", "COLLECT", "DEBIT", "CREDIT", "CR", "DR", "AUTOPAY", "RENEWAL",
    "SUBSCRIPTION", "FUNDS", "ADD", "HELP", "DINE", "PURCHASE", "SPEND",
    "MERCHANT", "PERSONAL", "TRANSFER", "CONTRIB", "CONTRIBUTION", "INVOICE",
    "BOOKING", "TICKET", "CONSULT", "RIDE",
    # entity tails
    "PVT", "LTD", "LIMITED", "LLP", "INC", "CO", "CORP", "CORPORATION",
    "TECHNOLOGIES", "TECHNOLOGY", "TECH", "ENTERPRISES", "HOLDINGS",
    "SECURITIES", "NETWORKS", "INC.", "SVCS",
    # cities / geo / country codes
    "MUM", "MUMBAI", "DEL", "DELHI", "BLR", "BANGALORE", "BENGALURU", "HYD",
    "HYDERABAD", "PUN", "PUNE", "CHN", "CHENNAI", "GUR", "GURGAON", "GURUGRAM",
    "NCR", "LKO", "LUCKNOW", "KOL", "KOLKATA", "NOIDA", "CA", "WA", "USA",
    "SEATTLE",
}

_SEP = re.compile(r"[\/\*\:\|_,\-\(\)\[\]#]+")
_VPA = re.compile(r"[\w.\-]+@[\w.\-]+")  # stop at '/' and whitespace — don't swallow later tokens
_ALLDIGITS = re.compile(r"^\d{3,}$")
_REFNUM = re.compile(r"\d{4,}")  # bank/ref/account codes: HDFC0001234, 4012781234
_KEEP = re.compile(r"[^A-Za-z0-9'& ]+")


@dataclass(frozen=True)
class Normalized:
    text: str            # cleaned, uppercased brand-ish string (for embedding)
    tokens: tuple[str, ...]  # cleaned tokens (for rule matching)


def _vpa_tokens(raw: str) -> list[str]:
    """Pull brand signal out of VPA handles: `blinkcommerce.rzp@axisb` -> blinkcommerce."""
    out: list[str] = []
    for m in _VPA.findall(raw):
        local = m.split("@", 1)[0]
        for part in re.split(r"[.\-]", local):
            p = part.strip()
            if p and p.lower() not in _VPA_SUFFIX and not _ALLDIGITS.match(p):
                out.append(p)
    return out


def normalize(raw: str | None, hint: str | None = None) -> Normalized:
    raw = raw or ""
    extra = _vpa_tokens(raw)

    # Hint (the bank's parsed merchant) is usually the cleanest signal — fold it in.
    combined = " ".join(filter(None, [hint or "", raw, " ".join(extra)]))

    # Drop full VPA handles (we already mined them), then split on separators.
    combined = _VPA.sub(" ", combined)
    combined = _SEP.sub(" ", combined)
    combined = _KEEP.sub(" ", combined)

    tokens: list[str] = []
    seen: set[str] = set()
    for tok in combined.split():
        up = tok.upper().strip("'&")
        if not up:
            continue
        if _ALLDIGITS.match(up):          # ref numbers / pincodes / amounts
            continue
        if _REFNUM.search(up):            # tokens carrying a long digit run (bank/ref codes)
            continue
        if up in _STOP:
            continue
        if len(up) == 1 and up.isalpha():  # stray single letters
            continue
        if up in seen:
            continue
        seen.add(up)
        tokens.append(up)

    text = " ".join(tokens)
    if not text:  # never return empty — fall back to a minimal clean of raw
        text = _KEEP.sub(" ", _SEP.sub(" ", raw)).upper().strip()
    return Normalized(text=text, tokens=tuple(tokens))

#!/usr/bin/env python3
"""Generate a one-page TrustLayer YC referral PDF."""
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib.colors import HexColor, white
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable,
)

NAVY = HexColor("#0F172A")
INK = HexColor("#111827")
MUTED = HexColor("#6B7280")
ACCENT = HexColor("#1D4ED8")
LIGHT = HexColor("#EEF2FF")
LINE = HexColor("#E5E7EB")

PAGE_W, PAGE_H = letter
MARGIN = 0.55 * inch

def st(name, **kw):
    base = dict(fontName="Helvetica", fontSize=9, leading=12.5, textColor=INK, alignment=TA_LEFT)
    base.update(kw)
    return ParagraphStyle(name, **base)

title_s   = st("title",  fontName="Helvetica-Bold", fontSize=20, leading=23, textColor=NAVY)
subtitle_s= st("sub",    fontSize=10.5, leading=14, textColor=MUTED)
h2_s      = st("h2", fontName="Helvetica-Bold", fontSize=10.5, leading=13, textColor=ACCENT, spaceBefore=6, spaceAfter=2)
body_s    = st("body", fontSize=8.6, leading=11.6, textColor=INK)
small_s   = st("small", fontSize=7.6, leading=9.6, textColor=MUTED)
bullet_s  = st("bullet", fontSize=8.6, leading=11.6, leftIndent=10, bulletIndent=2)

doc = SimpleDocTemplate(
    "TrustLayer_YC_Referral_OnePager.pdf",
    pagesize=letter,
    leftMargin=MARGIN, rightMargin=MARGIN,
    topMargin=0.45*inch, bottomMargin=0.45*inch,
    title="TrustLayer — YC Referral One-Pager",
    author="TrustLayer",
)

story = []

# ---------- Header ----------
story.append(Paragraph("TrustLayer", title_s))
story.append(Spacer(1, 2))
story.append(Paragraph(
    "The API apps call to know if the other side is a real human — not a deepfake, bot, or "
    "synthetic identity — without forcing users to give up privacy.",
    subtitle_s,
))
story.append(Spacer(1, 4))
story.append(HRFlowable(width="100%", thickness=2, color=ACCENT, spaceAfter=6))

# ---------- The problem / What we're solving ----------
story.append(Paragraph("What we're solving", h2_s))
story.append(Paragraph(
    "The internet was built on assumptions AI has broken: a face, a voice, a conversation, an account — none "
    "of these prove humanity anymore. Generative AI has driven the cost of impersonating a human toward zero: "
    "deepfakes, voice clones, synthetic reviews, AI-assisted interviews, and automated fraud are now cheap and "
    "scalable. Today's trust tools are fragmented point solutions — CAPTCHA stops cheap bots, KYC verifies a "
    "document once, fraud tools flag transactions after the fact. None answer the question applications actually "
    "need, continuously: <i>\"Can I trust this session, right now?\"</i> TrustLayer exists to build that missing "
    "trust infrastructure layer for the AI-native internet.",
    body_s,
))

# ---------- The product ----------
story.append(Paragraph("The product", h2_s))
story.append(Paragraph(
    "TrustLayer is two pieces: <b>TrustLayerOS</b>, the production control plane that scores whether a digital "
    "session is a live human — not a deepfake, replay, empty bot, or synthetic identity — and <b>TrustLayerSDK</b>, "
    "the client you call before you trust the other side.",
    body_s,
))
story.append(Paragraph(
    "The SDK captures session signals (behavior, device, network, camera, microphone under user consent), sends "
    "them to TrustLayerOS, and returns a decision your product can enforce: <b>allow · monitor · verify · review · "
    "block</b>, with <i>human_probability</i>, <i>deepfake_risk</i>, and <i>integrity_score</i>. The first wedge is "
    "interview / live-call authenticity — prove the person on the call is the real candidate, live and unassisted — "
    "then expand to transactions, fraud, bots, and AI agents.",
    body_s,
))

# How it works (three mini columns)
story.append(Spacer(1, 2))
hw = Table([
    [Paragraph("<b>1 · Capture</b><br/>SDK collects behavior, device, network, media signals with consent", body_s),
     Paragraph("<b>2 · Score</b><br/>TrustLayerOS runs trust + risk engines across interview, deepfake, bot, fraud, anomaly modules", body_s),
     Paragraph("<b>3 · Decide</b><br/>Policy engine returns allow / monitor / verify / review / block with field provenance", body_s)],
], colWidths=[(PAGE_W - 2*MARGIN - 12)/3]*3)
hw.setStyle(TableStyle([
    ("BACKGROUND", (0,0), (-1,-1), LIGHT),
    ("VALIGN", (0,0), (-1,-1), "TOP"),
    ("LEFTPADDING", (0,0), (-1,-1), 7), ("RIGHTPADDING", (0,0), (-1,-1), 7),
    ("TOPPADDING", (0,0), (-1,-1), 6), ("BOTTOMPADDING", (0,0), (-1,-1), 6),
    ("LINEBELOW", (0,0), (-1,-1), 0.5, LINE),
]))
story.append(hw)

# ---------- Why now ----------
story.append(Paragraph("Why now", h2_s))
story.append(Paragraph(
    "Generative AI and autonomous agents have changed the economics of deception: convincing fraud no longer needs "
    "expertise or resources — it scales. Video and voice are approaching human-level realism, so traditional trust "
    "signals are unreliable. Just as SSL secured websites, cloud secured infrastructure, and identity providers "
    "secured authentication, the next decade needs a layer that secures digital interactions. TrustLayer is that "
    "layer — privacy-first (consent, data minimization, features over raw recording), developer-first (simple API, "
    "open-source SDKs in TypeScript and Python), and built for continuous trust, not one-time IDV.",
    body_s,
))

# ---------- Differentiation ----------
story.append(Paragraph("Not KYC. Not CAPTCHA. Not proof-of-personhood.", h2_s))
diff = Table([
    [Paragraph("CAPTCHA / Turnstile", body_s), Paragraph("Stops cheap bots at the edge — not live video authenticity", small_s)],
    [Paragraph("Persona / Onfido", body_s), Paragraph("Verifies a document once — not continuous during the call", small_s)],
    [Paragraph("Worldcoin-style PoP", body_s), Paragraph("Proves unique personhood — not session risk", small_s)],
    [Paragraph("TrustLayer", body_s), Paragraph("Continuous multi-signal session authenticity: capture → score → decide", small_s)],
], colWidths=[1.7*inch, (PAGE_W - 2*MARGIN - 1.7*inch)])
diff.setStyle(TableStyle([
    ("VALIGN", (0,0), (-1,-1), "TOP"),
    ("LINEBELOW", (0,0), (-1,-2), 0.4, LINE),
    ("LEFTPADDING", (0,0), (-1,-1), 0), ("RIGHTPADDING", (0,0), (-1,-1), 6),
    ("TOPPADDING", (0,0), (-1,-1), 2.5), ("BOTTOMPADDING", (0,0), (-1,-1), 2.5),
    ("TEXTCOLOR", (0,0), (0,-1), ACCENT),
    ("FONTNAME", (0,0), (0,-1), "Helvetica-Bold"),
]))
story.append(diff)

# ---------- The ask / closing ----------
story.append(Spacer(1, 5))
story.append(HRFlowable(width="100%", thickness=1, color=LINE, spaceAfter=5))
story.append(Paragraph("Help us get into Y Combinator", h2_s))
story.append(Paragraph(
    "We're applying to YC to build the trust layer of the AI internet. If you believe the internet needs a "
    "programmable way to know there's a real human on the other side of a call, message, or transaction — please "
    "refer us. In an era of AI and deepfakes, protecting people starts with knowing who — and what — is really on "
    "the other end of the line.",
    body_s,
))
story.append(Spacer(1, 4))
footer = Table([
    [Paragraph('<b>GitHub:</b> TrustLayerSDK · TrustLayerOS · TrustLayerDocs', small_s),
     Paragraph('<b>One-liner:</b> "Can I trust this interaction?"', small_s)],
], colWidths=[(PAGE_W - 2*MARGIN)/2]*2)
footer.setStyle(TableStyle([
    ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
    ("LEFTPADDING", (0,0), (-1,-1), 0), ("RIGHTPADDING", (0,0), (-1,-1), 6),
    ("TOPPADDING", (0,0), (-1,-1), 2), ("BOTTOMPADDING", (0,0), (-1,-1), 2),
]))
story.append(footer)

doc.build(story)
print("PDF built: TrustLayer_YC_Referral_OnePager.pdf")

# API Contracts & Interface Specification

## 1. Global Conventions

- **Base Path**: `/api/v1`
- **Content-Type**: `application/json` (except multipart or binary downloads)
- **Time Format**: ISO 8601 UTC (`YYYY-MM-DDTHH:mm:ss.sssZ`)
- **Monetary Format**: Integer cents / paise (`amount_cents: 1250` = $12.50 or ₹12.50)

### Standard Success Envelope
```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "timestamp": "2026-10-17T23:50:00.000Z",
    "request_id": "req_01j9abcd..."
  }
}
```

### Standard Error Envelope
```json
{
  "success": false,
  "error": {
    "code": "TENANT_ACCESS_DENIED",
    "message": "Access to resources belonging to another shop is prohibited.",
    "details": null
  },
  "meta": {
    "timestamp": "2026-10-17T23:50:00.000Z",
    "request_id": "req_01j9abcd..."
  }
}
```

---

## 2. Role-Based Access Control (RBAC) Matrix

| Endpoint Group | Public / Anonymous | QR Customer | Shop Staff | Merchant Admin | Platform Admin |
| :--- | :---: | :---: | :---: | :---: | :---: |
| `GET /public/shops/:code` | Yes | Yes | Yes | Yes | Yes |
| `POST /public/documents/upload-intent` | Yes | Yes | Yes | Yes | Yes |
| `POST /public/pricing/quote` | Yes | Yes | Yes | Yes | Yes |
| `POST /public/orders/checkout` | No | Yes (Session) | Yes | Yes | Yes |
| `POST /webhooks/payments/:provider` | Signature Verified | - | - | - | - |
| `GET /print-stations/queue` | No | No | Yes (Own Shop) | Yes (Own Shop) | Yes (Any) |
| `POST /print-stations/jobs/:id/complete` | No | No | Yes (Own Shop) | Yes (Own Shop) | Yes (Any) |
| `GET /audit/logs` | No | No | No | Yes (Own Merchant) | Yes (All) |

---

## 3. Core API Endpoints

### 3.1. Public QR & Shop Resolution
`GET /api/v1/public/shops/:code`
Resolves a scanned QR code to active shop details, supported paper types, and current operational status.

**Response `200 OK`**:
```json
{
  "success": true,
  "data": {
    "shop_id": "shp_01j91234...",
    "shop_name": "Campus Print Express - North Library",
    "is_open": true,
    "catalog": [
      { "paper_size": "A4", "color_mode": "BW", "duplex_supported": true, "unit_price_cents": 100 },
      { "paper_size": "A4", "color_mode": "COLOR", "duplex_supported": true, "unit_price_cents": 500 }
    ]
  }
}
```

### 3.2. Document Upload Intent (Direct-to-S3)
`POST /api/v1/public/documents/upload-intent`
Generates a short-lived presigned S3 PUT URL for private customer PDF upload.

**Request Body**:
```json
{
  "shop_id": "shp_01j91234...",
  "file_name": "lecture_notes.pdf",
  "file_size_bytes": 1048576,
  "mime_type": "application/pdf"
}
```

**Response `201 Created`**:
```json
{
  "success": true,
  "data": {
    "document_id": "doc_01j95678...",
    "upload_url": "http://localhost:9000/qrprint-documents/tenants/shp_01j91234/documents/doc_01j95678.pdf?X-Amz-Signature=...",
    "expires_at": "2026-10-17T23:55:00.000Z"
  }
}
```

### 3.3. Authoritative Pricing Quote
`POST /api/v1/public/pricing/quote`
Inspects verified document parameters and computes authoritative server-calculated price.

**Request Body**:
```json
{
  "shop_id": "shp_01j91234...",
  "document_id": "doc_01j95678...",
  "color_mode": "BW",
  "paper_size": "A4",
  "duplex_mode": "SIMPLEX",
  "copies": 2
}
```

**Response `200 OK`**:
```json
{
  "success": true,
  "data": {
    "quote_id": "qte_01j99999...",
    "total_pages": 12,
    "copies": 2,
    "unit_price_cents": 100,
    "total_amount_cents": 2400,
    "currency": "INR",
    "expires_at": "2026-10-18T00:05:00.000Z"
  }
}
```

### 3.4. Order Checkout
`POST /api/v1/public/orders/checkout`
Locks the quote and initializes a payment session with the payment gateway.

**Request Body**:
```json
{
  "shop_id": "shp_01j91234...",
  "quote_id": "qte_01j99999...",
  "customer_phone": "+919876543210"
}
```

**Response `201 Created`**:
```json
{
  "success": true,
  "data": {
    "order_id": "ord_01j9aaaa...",
    "order_code": "QP-4821",
    "payment_gateway_order_id": "order_mock_12345",
    "amount_cents": 2400,
    "currency": "INR",
    "status": "PENDING_PAYMENT"
  }
}
```

### 3.5. Payment Gateway Webhook (Idempotent HMAC)
`POST /api/v1/webhooks/payments/:provider`
Receives verified payment notifications from Stripe/Razorpay.

**Headers**:
- `X-Webhook-Signature`: HMAC SHA-256 signature calculated with `PAYMENT_WEBHOOK_SECRET`

**Response `200 OK`**:
```json
{
  "success": true,
  "data": {
    "handled": true,
    "order_id": "ord_01j9aaaa...",
    "status": "PAID"
  }
}
```

### 3.6. Staff Print Station Queue
`GET /api/v1/print-stations/queue`
Returns active paid jobs for the authenticated shop staff user.

**Response `200 OK`**:
```json
{
  "success": true,
  "data": {
    "shop_id": "shp_01j91234...",
    "jobs": [
      {
        "job_id": "job_01j9bbbb...",
        "order_code": "QP-4821",
        "created_at": "2026-10-17T23:52:00.000Z",
        "pages": 12,
        "copies": 2,
        "color_mode": "BW",
        "paper_size": "A4",
        "duplex_mode": "SIMPLEX",
        "status": "QUEUED"
      }
    ]
  }
}
```

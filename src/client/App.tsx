import { useState, useEffect } from 'react';
import {
  Printer,
  QrCode,
  UploadCloud,
  FileText,
  CreditCard,
  CheckCircle2,
  ShieldCheck,
  Download,
  Settings2,
  Store,
  RefreshCw,
} from 'lucide-react';
import QRCode from 'qrcode';

interface Shop {
  id: string;
  name: string;
  slug: string;
  qrCodeToken: string;
  address: string;
  city: string;
  isOpen: boolean;
  rates: Array<{
    paperSize: string;
    colorMode: string;
    duplexMode: string;
    pricePerPageCents: number;
  }>;
}

interface Quote {
  pages: number;
  copies: number;
  unitPriceCents: number;
  totalAmountCents: number;
  currency: string;
}

interface OrderItem {
  id: string;
  originalFilename: string;
  pageCount: number;
  paperSize: string;
  colorMode: string;
  duplexMode: string;
  copies: number;
  totalPriceCents: number;
}

interface PrintJob {
  jobId: string;
  orderId: string;
  orderCode: string;
  customerPhone?: string;
  totalAmountCents: number;
  status: string;
  createdAt: string;
  items: OrderItem[];
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'customer' | 'staff' | 'merchant'>('customer');
  const [selectedShop, setSelectedShop] = useState<Shop | null>(null);

  // Customer State
  const [uploadedFile, setUploadedFile] = useState<{ name: string; size: number; pages: number } | null>({
    name: 'CS402_Distributed_Systems_Lecture_Notes.pdf',
    size: 2450000,
    pages: 14,
  });
  const [paperSize, setPaperSize] = useState<'A4' | 'A3' | 'LEGAL'>('A4');
  const [colorMode, setColorMode] = useState<'BW' | 'COLOR'>('BW');
  const [duplexMode, setDuplexMode] = useState<'SIMPLEX' | 'DUPLEX'>('DUPLEX');
  const [copies, setCopies] = useState<number>(1);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [customerPhone, setCustomerPhone] = useState<string>('+91 98765 43210');
  const [activeOrder, setActiveOrder] = useState<{
    orderId: string;
    orderCode: string;
    status: string;
    totalAmountCents: number;
  } | null>(null);
  const [isProcessingPayment, setIsProcessingPayment] = useState<boolean>(false);

  // Staff State
  const [queue, setQueue] = useState<PrintJob[]>([]);
  const [isLoadingQueue, setIsLoadingQueue] = useState<boolean>(false);
  const [downloadTicket, setDownloadTicket] = useState<{ jobId: string; url: string; countdown: number } | null>(null);

  // Merchant State
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [customBwRate, setCustomBwRate] = useState<number>(100);
  const [customColorRate, setCustomColorRate] = useState<number>(500);

  // Load Initial Shops from Backend API
  useEffect(() => {
    async function loadShop() {
      try {
        const res = await fetch('/api/v1/public/shops/QR_CAMPUS_NORTH_LIB_01');
        const data = await res.json();
        if (data.success) {
          setSelectedShop(data.data);
        }
      } catch {
        // Fallback demo state if running standalone
        const demoShop: Shop = {
          id: '04779a49-d362-4c39-8d6d-a7a7397c83ee',
          name: 'North Campus Central Library',
          slug: 'north-library',
          qrCodeToken: 'QR_CAMPUS_NORTH_LIB_01',
          address: 'Ground Floor, Central Library, University Campus',
          city: 'Mumbai',
          isOpen: true,
          rates: [
            { paperSize: 'A4', colorMode: 'BW', duplexMode: 'SIMPLEX', pricePerPageCents: 100 },
            { paperSize: 'A4', colorMode: 'BW', duplexMode: 'DUPLEX', pricePerPageCents: 80 },
            { paperSize: 'A4', colorMode: 'COLOR', duplexMode: 'SIMPLEX', pricePerPageCents: 500 },
            { paperSize: 'A4', colorMode: 'COLOR', duplexMode: 'DUPLEX', pricePerPageCents: 450 },
          ],
        };
        setSelectedShop(demoShop);
      }
    }
    loadShop();
  }, []);

  // Update Authoritative Quote
  useEffect(() => {
    if (!selectedShop || !uploadedFile) return;

    fetch('/api/v1/public/pricing/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shopId: selectedShop.id,
        pages: uploadedFile.pages,
        copies,
        colorMode,
        duplexMode,
        paperSize,
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setQuote(data.data);
        }
      })
      .catch(() => {
        // Local calculation fallback
        const rate = colorMode === 'COLOR' ? 500 : duplexMode === 'DUPLEX' ? 80 : 100;
        setQuote({
          pages: uploadedFile.pages,
          copies,
          unitPriceCents: rate,
          totalAmountCents: uploadedFile.pages * copies * rate,
          currency: 'INR',
        });
      });
  }, [selectedShop, uploadedFile, paperSize, colorMode, duplexMode, copies]);

  // Generate QR Code for Merchant Standee
  useEffect(() => {
    if (selectedShop) {
      QRCode.toDataURL(`https://printhub.campus.internal/s/${selectedShop.qrCodeToken}`, {
        width: 320,
        margin: 2,
        color: { dark: '#0a0e17', light: '#ffffff' },
      }).then(setQrDataUrl);
    }
  }, [selectedShop]);

  // Load Staff Queue
  const fetchQueue = async () => {
    if (!selectedShop) return;
    setIsLoadingQueue(true);
    try {
      const res = await fetch(`/api/v1/print-stations/queue?shopId=${selectedShop.id}`);
      const data = await res.json();
      if (data.success) {
        setQueue(data.data);
      }
    } catch {
      // Demo jobs if API mock
    } finally {
      setIsLoadingQueue(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'staff') {
      fetchQueue();
      const interval = setInterval(fetchQueue, 5000);
      return () => clearInterval(interval);
    }
  }, [activeTab, selectedShop]);

  // Handle Checkout & Instant Payment
  const handleCheckoutAndPay = async () => {
    if (!selectedShop || !uploadedFile || !quote) return;
    setIsProcessingPayment(true);

    try {
      // 1. Create upload intent
      const intentRes = await fetch('/api/v1/public/documents/upload-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shopId: selectedShop.id,
          filename: uploadedFile.name,
          fileSizeBytes: uploadedFile.size,
          mimeType: 'application/pdf',
        }),
      });
      const intentData = await intentRes.json();
      const docId = intentData.data.documentId;

      // 2. Verify page count
      await fetch('/api/v1/public/documents/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId: docId,
          pageCount: uploadedFile.pages,
        }),
      });

      // 3. Create Checkout Order
      const orderRes = await fetch('/api/v1/public/orders/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shopId: selectedShop.id,
          documentId: docId,
          paperSize,
          colorMode,
          duplexMode,
          copies,
          customerPhone,
        }),
      });
      const orderData = await orderRes.json();
      const order = orderData.data;

      // 4. Confirm Payment (Simulated instant gateway webhook)
      await fetch(`/api/v1/public/orders/${order.orderId}/pay`, { method: 'POST' });

      setActiveOrder({
        orderId: order.orderId,
        orderCode: order.orderCode,
        status: 'PAID',
        totalAmountCents: order.totalAmountCents,
      });

      // Refresh staff queue if open
      fetchQueue();
    } catch (err) {
      console.error('Checkout error:', err);
    } finally {
      setIsProcessingPayment(false);
    }
  };

  // Staff: Dispatch Download
  const handleGetDownloadTicket = async (jobId: string) => {
    if (!selectedShop) return;
    try {
      const res = await fetch(`/api/v1/print-stations/jobs/${jobId}/download-ticket?shopId=${selectedShop.id}`);
      const data = await res.json();
      if (data.success) {
        setDownloadTicket({
          jobId,
          url: data.data.downloadUrl,
          countdown: 60,
        });
        fetchQueue();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Staff: Mark Complete & Purge
  const handleCompleteJob = async (jobId: string) => {
    if (!selectedShop) return;
    try {
      await fetch(`/api/v1/print-stations/jobs/${jobId}/complete?shopId=${selectedShop.id}`, { method: 'POST' });
      setDownloadTicket(null);
      fetchQueue();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* SaaS Navigation Header */}
      <header
        style={{
          borderBottom: '1px solid var(--border-subtle)',
          background: 'rgba(10, 14, 23, 0.85)',
          backdropFilter: 'blur(12px)',
          position: 'sticky',
          top: 0,
          zIndex: 50,
          padding: '16px 24px',
        }}
      >
        <div style={{ maxWidth: '1280px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #4f46e5, #06b6d4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: 'var(--glow-indigo)',
              }}
            >
              <Printer size={22} color="white" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h1 style={{ fontSize: '1.25rem', fontWeight: 800, letterSpacing: '-0.02em' }}>QR-PrintHub</h1>
                <span className="badge badge-indigo">SaaS Platform</span>
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-subtle)' }}>Multi-Tenant Cloud Printing Infrastructure</p>
            </div>
          </div>

          {/* Mode Switcher Tabs */}
          <div
            style={{
              display: 'flex',
              background: 'rgba(255, 255, 255, 0.04)',
              padding: '4px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <button
              onClick={() => setActiveTab('customer')}
              className={activeTab === 'customer' ? 'btn-primary' : 'btn-secondary'}
              style={{ padding: '8px 16px', fontSize: '0.85rem' }}
            >
              <QrCode size={16} /> 1. Customer Scan Flow
            </button>
            <button
              onClick={() => setActiveTab('staff')}
              className={activeTab === 'staff' ? 'btn-primary' : 'btn-secondary'}
              style={{ padding: '8px 16px', fontSize: '0.85rem' }}
            >
              <Printer size={16} /> 2. Staff Print Station ({queue.length})
            </button>
            <button
              onClick={() => setActiveTab('merchant')}
              className={activeTab === 'merchant' ? 'btn-primary' : 'btn-secondary'}
              style={{ padding: '8px 16px', fontSize: '0.85rem' }}
            >
              <Store size={16} /> 3. Merchant SaaS Admin
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main style={{ flex: 1, maxWidth: '1280px', width: '100%', margin: '0 auto', padding: '32px 24px' }}>
        {/* ========================================================================= */}
        {/* TAB 1: CUSTOMER MOBILE QR SCAN EXPERIENCE */}
        {/* ========================================================================= */}
        {activeTab === 'customer' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)', gap: '32px', alignItems: 'start' }}>
            {/* Left: Configuration Steps */}
            <div>
              {/* Shop Header Banner */}
              <div className="glass-panel" style={{ padding: '24px', marginBottom: '24px', position: 'relative', overflow: 'hidden' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', flexWrap: 'wrap', gap: '16px' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                      <span className="pulse-dot"></span>
                      <span className="badge badge-emerald">Shop Open • Ready to Print</span>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-subtle)' }}>QR Token: {selectedShop?.qrCodeToken}</span>
                    </div>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '6px' }}>{selectedShop?.name}</h2>
                    <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>📍 {selectedShop?.address}, {selectedShop?.city}</p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)' }}>Active Operating Hours</div>
                    <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-main)' }}>08:00 AM – 09:00 PM</div>
                  </div>
                </div>
              </div>

              {/* Step 1: Document Upload */}
              <div className="glass-panel" style={{ padding: '24px', marginBottom: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                  <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'rgba(99, 102, 241, 0.2)', color: '#818cf8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.85rem' }}>1</div>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Select Document to Print</h3>
                </div>

                {uploadedFile ? (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid rgba(99, 102, 241, 0.3)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '16px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                      <div style={{ padding: '12px', background: 'rgba(99, 102, 241, 0.15)', borderRadius: '8px' }}>
                        <FileText size={24} color="#818cf8" />
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{uploadedFile.name}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          {(uploadedFile.size / 1024 / 1024).toFixed(2)} MB • <span style={{ color: '#34d399', fontWeight: 600 }}>{uploadedFile.pages} Pages Detected</span>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => setUploadedFile({ name: 'Architecture_Design_Document.pdf', size: 1800000, pages: 8 })}
                      className="btn-secondary"
                      style={{ fontSize: '0.8rem', padding: '6px 12px' }}
                    >
                      Change File
                    </button>
                  </div>
                ) : (
                  <div
                    style={{
                      border: '2px dashed var(--border-subtle)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '36px',
                      textAlign: 'center',
                      cursor: 'pointer',
                    }}
                  >
                    <UploadCloud size={36} color="var(--text-subtle)" style={{ margin: '0 auto 12px' }} />
                    <div style={{ fontWeight: 600 }}>Tap or drag PDF to upload</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-subtle)', marginTop: '4px' }}>Maximum 50MB • Encrypted Private Upload</div>
                  </div>
                )}
              </div>

              {/* Step 2: Print Parameters */}
              <div className="glass-panel" style={{ padding: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
                  <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'rgba(99, 102, 241, 0.2)', color: '#818cf8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.85rem' }}>2</div>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Print Configuration</h3>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
                  {/* Color Mode */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '8px', color: 'var(--text-muted)' }}>Color Mode</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      <button
                        onClick={() => setColorMode('BW')}
                        className={colorMode === 'BW' ? 'btn-primary' : 'btn-secondary'}
                        style={{ padding: '12px', fontSize: '0.85rem', width: '100%' }}
                      >
                        B&W (₹1.00/page)
                      </button>
                      <button
                        onClick={() => setColorMode('COLOR')}
                        className={colorMode === 'COLOR' ? 'btn-primary' : 'btn-secondary'}
                        style={{ padding: '12px', fontSize: '0.85rem', width: '100%' }}
                      >
                        Color (₹5.00/page)
                      </button>
                    </div>
                  </div>

                  {/* Duplex Mode */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '8px', color: 'var(--text-muted)' }}>Sides</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      <button
                        onClick={() => setDuplexMode('SIMPLEX')}
                        className={duplexMode === 'SIMPLEX' ? 'btn-primary' : 'btn-secondary'}
                        style={{ padding: '12px', fontSize: '0.85rem', width: '100%' }}
                      >
                        Single Sided
                      </button>
                      <button
                        onClick={() => setDuplexMode('DUPLEX')}
                        className={duplexMode === 'DUPLEX' ? 'btn-primary' : 'btn-secondary'}
                        style={{ padding: '12px', fontSize: '0.85rem', width: '100%' }}
                      >
                        Double Sided (Save 20%)
                      </button>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                  {/* Paper Format */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '8px', color: 'var(--text-muted)' }}>Paper Size</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {(['A4', 'A3', 'LEGAL'] as const).map((size) => (
                        <button
                          key={size}
                          onClick={() => setPaperSize(size)}
                          className={paperSize === size ? 'btn-primary' : 'btn-secondary'}
                          style={{ flex: 1, padding: '10px', fontSize: '0.85rem' }}
                        >
                          {size}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Copies Stepper */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '8px', color: 'var(--text-muted)' }}>Copies</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <button
                        onClick={() => setCopies(Math.max(1, copies - 1))}
                        className="btn-secondary"
                        style={{ width: '40px', height: '40px', padding: 0 }}
                      >
                        -
                      </button>
                      <span style={{ fontSize: '1.25rem', fontWeight: 700, minWidth: '32px', textAlign: 'center' }}>{copies}</span>
                      <button
                        onClick={() => setCopies(copies + 1)}
                        className="btn-secondary"
                        style={{ width: '40px', height: '40px', padding: 0 }}
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Authoritative Quote & Checkout */}
            <div style={{ position: 'sticky', top: '100px' }}>
              <div className="glass-panel" style={{ padding: '28px', border: '1px solid rgba(99, 102, 241, 0.4)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
                  <h3 style={{ fontSize: '1.15rem', fontWeight: 700 }}>Authoritative Quote</h3>
                  <span className="badge badge-emerald">Verified Server Rate</span>
                </div>

                {quote && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                      <span>Document Length</span>
                      <span style={{ color: 'var(--text-main)', fontWeight: 600 }}>{quote.pages} pages</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                      <span>Copies</span>
                      <span style={{ color: 'var(--text-main)', fontWeight: 600 }}>× {quote.copies}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                      <span>Mode & Paper</span>
                      <span style={{ color: 'var(--text-main)', fontWeight: 600 }}>{paperSize} • {colorMode} • {duplexMode}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                      <span>Rate per page</span>
                      <span style={{ color: 'var(--text-main)', fontWeight: 600 }}>₹{(quote.unitPriceCents / 100).toFixed(2)}</span>
                    </div>

                    <div style={{ height: '1px', background: 'var(--border-subtle)', margin: '8px 0' }}></div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <span style={{ fontSize: '1.1rem', fontWeight: 700 }}>Total Payable</span>
                      <span style={{ fontSize: '1.8rem', fontWeight: 800, color: '#34d399' }}>
                        ₹{(quote.totalAmountCents / 100).toFixed(2)}
                      </span>
                    </div>
                  </div>
                )}

                {/* Customer Phone for Pick-up SMS */}
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px' }}>Phone Number for Pick-up Notification</label>
                  <input
                    type="tel"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    style={{
                      width: '100%',
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '10px 14px',
                      color: 'white',
                      fontSize: '0.9rem',
                    }}
                  />
                </div>

                {activeOrder ? (
                  <div style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.4)', borderRadius: 'var(--radius-sm)', padding: '16px', textAlign: 'center' }}>
                    <CheckCircle2 size={32} color="#34d399" style={{ margin: '0 auto 8px' }} />
                    <div style={{ fontWeight: 700, fontSize: '1.1rem', color: '#34d399' }}>Order Confirmed & Queued!</div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 800, letterSpacing: '0.05em', margin: '8px 0' }}>{activeOrder.orderCode}</div>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Show this code to shop operator or collect from kiosk tray when ready.</p>
                  </div>
                ) : (
                  <button
                    onClick={handleCheckoutAndPay}
                    disabled={isProcessingPayment || !quote}
                    className="btn-success"
                    style={{ width: '100%', padding: '14px', fontSize: '1rem' }}
                  >
                    <CreditCard size={18} />
                    {isProcessingPayment ? 'Processing Payment...' : `Pay ₹${((quote?.totalAmountCents || 0) / 100).toFixed(2)} & Queue Print`}
                  </button>
                )}

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginTop: '16px', color: 'var(--text-subtle)', fontSize: '0.75rem' }}>
                  <ShieldCheck size={14} color="#34d399" /> 100% Private • Ephemeral Auto-Purge within 2h
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: STAFF PRINT STATION QUEUE */}
        {/* ========================================================================= */}
        {activeTab === 'staff' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <div>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 800 }}>Staff Print Station Dispatcher</h2>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Live incoming paid print queue for {selectedShop?.name}</p>
              </div>
              <button onClick={fetchQueue} className="btn-secondary" style={{ padding: '8px 14px', fontSize: '0.85rem' }}>
                <RefreshCw size={14} className={isLoadingQueue ? 'spin' : ''} /> Refresh Queue
              </button>
            </div>

            {queue.length === 0 ? (
              <div className="glass-panel" style={{ padding: '60px 24px', textAlign: 'center' }}>
                <CheckCircle2 size={48} color="#34d399" style={{ margin: '0 auto 16px', opacity: 0.8 }} />
                <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '6px' }}>Print Queue is Clear</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>All pending orders have been printed and auto-purged from storage.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {queue.map((job) => (
                  <div key={job.jobId} className="glass-panel glass-panel-interactive" style={{ padding: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <div
                          style={{
                            padding: '12px 18px',
                            background: 'rgba(99, 102, 241, 0.15)',
                            borderRadius: 'var(--radius-sm)',
                            textAlign: 'center',
                          }}
                        >
                          <div style={{ fontSize: '0.75rem', color: '#818cf8', fontWeight: 600 }}>CODE</div>
                          <div style={{ fontSize: '1.3rem', fontWeight: 800, color: 'white' }}>{job.orderCode}</div>
                        </div>

                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                            <span className="badge badge-amber">{job.status}</span>
                            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Total Paid: ₹{(job.totalAmountCents / 100).toFixed(2)}</span>
                          </div>
                          {job.items?.map((item, idx) => (
                            <div key={idx} style={{ fontSize: '0.85rem', color: 'var(--text-main)', fontWeight: 500 }}>
                              📄 {item.originalFilename} — <span style={{ color: '#818cf8' }}>{item.pageCount} pages × {item.copies} copies ({item.colorMode}, {item.duplexMode})</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <button
                          onClick={() => handleGetDownloadTicket(job.jobId)}
                          className="btn-secondary"
                          style={{ fontSize: '0.85rem' }}
                        >
                          <Download size={15} /> 1. Download Stream (60s TTL)
                        </button>
                        <button
                          onClick={() => handleCompleteJob(job.jobId)}
                          className="btn-success"
                          style={{ fontSize: '0.85rem' }}
                        >
                          <CheckCircle2 size={15} /> 2. Mark Printed & Purge S3
                        </button>
                      </div>
                    </div>

                    {downloadTicket && downloadTicket.jobId === job.jobId && (
                      <div style={{ marginTop: '16px', padding: '12px', background: 'rgba(99, 102, 241, 0.1)', borderRadius: '8px', border: '1px solid rgba(99, 102, 241, 0.3)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.85rem', color: '#818cf8' }}>⚡ Presigned S3 single-use stream ready (Expires in 60s)</span>
                        <a href={downloadTicket.url} target="_blank" rel="noopener noreferrer" className="btn-primary" style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
                          Open Raw PDF Stream
                        </a>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: MERCHANT SAAS ADMIN & ANALYTICS */}
        {/* ========================================================================= */}
        {activeTab === 'merchant' && (
          <div>
            {/* KPI Metrics */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px', marginBottom: '32px' }}>
              <div className="glass-panel" style={{ padding: '20px' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-subtle)', marginBottom: '6px' }}>Total SaaS Revenue</div>
                <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#34d399' }}>₹14,820</div>
                <div style={{ fontSize: '0.75rem', color: '#34d399', marginTop: '4px' }}>+18% from last week</div>
              </div>
              <div className="glass-panel" style={{ padding: '20px' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-subtle)', marginBottom: '6px' }}>Pages Printed Today</div>
                <div style={{ fontSize: '1.8rem', fontWeight: 800 }}>1,248</div>
                <div style={{ fontSize: '0.75rem', color: '#818cf8', marginTop: '4px' }}>Across 2 campus kiosks</div>
              </div>
              <div className="glass-panel" style={{ padding: '20px' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-subtle)', marginBottom: '6px' }}>Ephemeral Files Purged</div>
                <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#06b6d4' }}>142</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', marginTop: '4px' }}>Zero storage leakage</div>
              </div>
              <div className="glass-panel" style={{ padding: '20px' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-subtle)', marginBottom: '6px' }}>Active Print Stations</div>
                <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#fbbf24' }}>2 / 2</div>
                <div style={{ fontSize: '0.75rem', color: '#34d399', marginTop: '4px' }}>100% Online</div>
              </div>
            </div>

            {/* Standee Generator & Rate Card Editor */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>
              {/* Printable Standee */}
              <div className="glass-panel" style={{ padding: '28px', textAlign: 'center' }}>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '6px' }}>Printable Kiosk QR Standee</h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '20px' }}>Place on counter for customers to scan and print instantly</p>

                {qrDataUrl && (
                  <div style={{ background: 'white', padding: '20px', borderRadius: '16px', display: 'inline-block', marginBottom: '20px', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
                    <img src={qrDataUrl} alt="Shop QR Standee" style={{ width: '220px', height: '220px', display: 'block' }} />
                    <div style={{ color: '#0a0e17', fontWeight: 800, fontSize: '1rem', marginTop: '8px' }}>{selectedShop?.name}</div>
                    <div style={{ color: '#64748b', fontSize: '0.75rem' }}>Scan to Print in 60 Seconds</div>
                  </div>
                )}

                <div>
                  <button onClick={() => window.print()} className="btn-primary" style={{ padding: '10px 20px' }}>
                    <Printer size={16} /> Print Official Counter Standee
                  </button>
                </div>
              </div>

              {/* Dynamic Rate Card Editor */}
              <div className="glass-panel" style={{ padding: '28px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                  <Settings2 size={20} color="#818cf8" />
                  <h3 style={{ fontSize: '1.2rem', fontWeight: 700 }}>Custom Shop Rate Card</h3>
                </div>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '20px' }}>Rates are authoritatively enforced across all QR scans</p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '6px' }}>Standard A4 Black & White (per page in paise)</label>
                    <input
                      type="number"
                      value={customBwRate}
                      onChange={(e) => setCustomBwRate(Number(e.target.value))}
                      style={{
                        width: '100%',
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-sm)',
                        padding: '10px 14px',
                        color: 'white',
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '6px' }}>Premium A4 Full Color (per page in paise)</label>
                    <input
                      type="number"
                      value={customColorRate}
                      onChange={(e) => setCustomColorRate(Number(e.target.value))}
                      style={{
                        width: '100%',
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-sm)',
                        padding: '10px 14px',
                        color: 'white',
                      }}
                    />
                  </div>

                  <button className="btn-success" style={{ marginTop: '12px' }}>
                    Save Updated Rate Card
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

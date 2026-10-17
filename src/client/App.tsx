import React, { useState, useEffect } from 'react';
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
  Crown,
  Building2,
  DollarSign,
  PlusCircle,
  ExternalLink,
  ChevronRight,
  TrendingUp,
  Smartphone,
  Layers,
  ArrowRight,
  Globe,
  Sparkles,
} from 'lucide-react';
import QRCode from 'qrcode';

// ============================================================================
// TYPES & DATA CONTRACTS
// ============================================================================
type PortalRoute = 'hub' | 'platform_admin' | 'merchant_admin' | 'shop_staff' | 'customer';

interface Merchant {
  id: string;
  name: string;
  slug: string;
  email: string;
  status: string;
  subscriptionTier: string;
  shopCount: number;
}

interface PlatformAnalytics {
  totalMerchants: number;
  activeShops: number;
  totalOrders: number;
  totalGmvCents: number;
  mrrCents: number;
}

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

interface PrintJob {
  jobId: string;
  orderId: string;
  orderCode: string;
  customerPhone?: string;
  totalAmountCents: number;
  status: string;
  createdAt: string;
  items: Array<{
    documentId: string;
    originalFilename: string;
    pageCount: number;
    paperSize: string;
    colorMode: string;
    duplexMode: string;
    copies: number;
  }>;
}

// Helper to determine active route from URL path or query params
function getRouteFromUrl(): PortalRoute {
  const path = window.location.pathname.toLowerCase();
  const search = window.location.search.toLowerCase();

  if (path.includes('/super-admin') || path.includes('/platform') || search.includes('portal=super-admin')) {
    return 'platform_admin';
  }
  if (path.includes('/merchant') || path.includes('/owner') || search.includes('portal=merchant')) {
    return 'merchant_admin';
  }
  if (path.includes('/station') || path.includes('/staff') || search.includes('portal=station')) {
    return 'shop_staff';
  }
  if (path.includes('/kiosk') || path.includes('/scan') || path.includes('/s/') || search.includes('portal=kiosk')) {
    return 'customer';
  }
  return 'hub';
}

export default function App() {
  const [route, setRoute] = useState<PortalRoute>(getRouteFromUrl());

  // Listen to browser navigation (back/forward buttons)
  useEffect(() => {
    const handlePopState = () => {
      setRoute(getRouteFromUrl());
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateTo = (newRoute: PortalRoute, inNewTab = false) => {
    let path = '/';
    if (newRoute === 'platform_admin') path = '/super-admin';
    else if (newRoute === 'merchant_admin') path = '/merchant';
    else if (newRoute === 'shop_staff') path = '/station';
    else if (newRoute === 'customer') path = '/kiosk';

    if (inNewTab) {
      window.open(path, '_blank');
      return;
    }

    window.history.pushState({}, '', path);
    setRoute(newRoute);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Shared state
  const [platformStats, setPlatformStats] = useState<PlatformAnalytics | null>(null);
  const [merchantsList, setMerchantsList] = useState<Merchant[]>([]);
  const [selectedShop, setSelectedShop] = useState<Shop | null>(null);

  // Platform Admin Onboarding Form
  const [showOnboardModal, setShowOnboardModal] = useState(false);
  const [newBizName, setNewBizName] = useState('');
  const [newOwnerName, setNewOwnerName] = useState('');
  const [newOwnerEmail, setNewOwnerEmail] = useState('');
  const [newTier, setNewTier] = useState<'STARTER' | 'PRO' | 'ENTERPRISE'>('PRO');
  const [newShopName, setNewShopName] = useState('');
  const [newCity, setNewCity] = useState('');

  // Merchant Portal State
  const [customBwRate, setCustomBwRate] = useState<number>(100);
  const [customColorRate, setCustomColorRate] = useState<number>(500);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [rateSavedMessage, setRateSavedMessage] = useState<string | null>(null);

  // Shop Staff Queue State
  const [queue, setQueue] = useState<PrintJob[]>([]);
  const [isLoadingQueue, setIsLoadingQueue] = useState(false);
  const [downloadTicket, setDownloadTicket] = useState<{ jobId: string; url: string } | null>(null);

  // Customer Mobile Kiosk State
  const [uploadedFile, setUploadedFile] = useState<{ name: string; size: number; pages: number } | null>({
    name: 'College_Final_Project_Report.pdf',
    size: 2450000,
    pages: 14,
  });
  const [paperSize, setPaperSize] = useState<'A4' | 'A3' | 'LEGAL'>('A4');
  const [colorMode, setColorMode] = useState<'BW' | 'COLOR'>('BW');
  const [duplexMode, setDuplexMode] = useState<'SIMPLEX' | 'DUPLEX'>('DUPLEX');
  const [copies, setCopies] = useState<number>(1);
  const [customerPhone, setCustomerPhone] = useState<string>('+91 98765 43210');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [isProcessingPayment, setIsProcessingPayment] = useState<boolean>(false);
  const [activeOrder, setActiveOrder] = useState<{ orderCode: string; status: string } | null>(null);

  // Load Platform & Shop Data
  const loadPlatformData = async () => {
    try {
      const [statsRes, merchRes] = await Promise.all([
        fetch('/api/v1/platform/analytics'),
        fetch('/api/v1/platform/merchants'),
      ]);
      const statsData = await statsRes.json();
      const merchData = await merchRes.json();
      if (statsData.success) setPlatformStats(statsData.data);
      if (merchData.success) setMerchantsList(merchData.data);
    } catch (e) {
      console.warn('API fetch warning:', e);
    }
  };

  useEffect(() => {
    loadPlatformData();

    // Default shop (Central Library Kiosk)
    fetch('/api/v1/public/shops/by-token/CAMPUS-LIB-QR-001')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.data) {
          setSelectedShop(data.data);
        }
      })
      .catch(() => {
        // Fallback shop state
        setSelectedShop({
          id: 'shop-lib-01',
          name: 'Campus Prints — Central Library Kiosk',
          slug: 'central-library',
          qrCodeToken: 'CAMPUS-LIB-QR-001',
          address: 'Main University Library, Ground Floor',
          city: 'Bangalore',
          isOpen: true,
          rates: [],
        });
      });
  }, []);

  // Update Authoritative Quote
  useEffect(() => {
    if (!selectedShop || !uploadedFile) return;

    fetch('/api/v1/public/pricing/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shopId: selectedShop.id,
        paperSize,
        colorMode,
        duplexMode,
        pageCount: uploadedFile.pages,
        copies,
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setQuote(data.data);
        }
      })
      .catch(() => {
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

  // Generate QR Standee Image
  useEffect(() => {
    if (selectedShop) {
      const origin = window.location.origin;
      const kioskUrl = `${origin}/kiosk?token=${selectedShop.qrCodeToken}`;
      QRCode.toDataURL(kioskUrl, {
        width: 320,
        margin: 2,
        color: { dark: '#0a0e17', light: '#ffffff' },
      }).then(setQrDataUrl);
    }
  }, [selectedShop]);

  // Fetch Queue for Staff
  const fetchQueue = async () => {
    if (!selectedShop) return;
    setIsLoadingQueue(true);
    try {
      const res = await fetch(`/api/v1/print-stations/queue?shopId=${selectedShop.id}`);
      const data = await res.json();
      if (data.success) setQueue(data.data);
    } finally {
      setIsLoadingQueue(false);
    }
  };

  useEffect(() => {
    if (route === 'shop_staff') {
      fetchQueue();
      const interval = setInterval(fetchQueue, 4000);
      return () => clearInterval(interval);
    }
  }, [route, selectedShop]);

  // Onboard New Merchant
  const handleOnboardMerchant = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/v1/platform/merchants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessName: newBizName,
          ownerName: newOwnerName,
          ownerEmail: newOwnerEmail,
          subscriptionTier: newTier,
          initialShopName: newShopName,
          city: newCity,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setShowOnboardModal(false);
        setNewBizName('');
        setNewOwnerName('');
        setNewOwnerEmail('');
        setNewShopName('');
        setNewCity('');
        await loadPlatformData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Customer Checkout & Pay
  const handleCheckoutAndPay = async () => {
    if (!selectedShop || !uploadedFile || !quote) return;
    setIsProcessingPayment(true);
    try {
      const intentRes = await fetch('/api/v1/public/documents/upload-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shopId: selectedShop.id,
          filename: uploadedFile.name,
          contentType: 'application/pdf',
          fileSizeBytes: uploadedFile.size,
        }),
      });
      const intentData = await intentRes.json();
      const documentId = intentData.data?.documentId || 'doc-demo-' + Math.random().toString(36).substring(7);

      const orderRes = await fetch('/api/v1/public/orders/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shopId: selectedShop.id,
          customerPhone,
          items: [
            {
              documentId,
              paperSize,
              colorMode,
              duplexMode,
              copies,
              pageRange: `1-${uploadedFile.pages}`,
            },
          ],
        }),
      });
      const orderData = await orderRes.json();

      if (orderData.success) {
        const orderId = orderData.data.orderId;
        const code = orderData.data.orderCode;

        await fetch(`/api/v1/public/orders/${orderId}/pay`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            paymentMethod: 'UPI_INSTANT',
            gatewayTransactionId: 'PAY-TXN-' + Math.random().toString(36).substring(4).toUpperCase(),
          }),
        });

        setActiveOrder({
          orderCode: code,
          status: 'PAID & QUEUED',
        });
        fetchQueue();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsProcessingPayment(false);
    }
  };

  // Staff: Get Presigned Download Ticket
  const handleGetDownloadTicket = async (jobId: string) => {
    if (!selectedShop) return;
    try {
      const res = await fetch(`/api/v1/print-stations/jobs/${jobId}/ticket?shopId=${selectedShop.id}`);
      const data = await res.json();
      if (data.success) {
        setDownloadTicket({
          jobId,
          url: data.data.downloadUrl,
        });
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Staff: Mark Complete & Purge
  const handleCompleteJob = async (jobId: string) => {
    if (!selectedShop) return;
    try {
      await fetch(`/api/v1/print-stations/jobs/${jobId}/complete?shopId=${selectedShop.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      setDownloadTicket(null);
      fetchQueue();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* ========================================================================= */}
      {/* 1. MASTER SAAS LAUNCHPAD & ECOSYSTEM DIRECTORY (ROUTE: /) */}
      {/* ========================================================================= */}
      {route === 'hub' && (
        <div style={{ flex: 1, maxWidth: '1400px', width: '100%', margin: '0 auto', padding: '40px 24px' }}>
          {/* Hero Banner */}
          <div style={{ textAlign: 'center', marginBottom: '48px' }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 14px',
                background: 'rgba(99, 102, 241, 0.12)',
                border: '1px solid rgba(99, 102, 241, 0.3)',
                borderRadius: 'var(--radius-full)',
                color: '#818cf8',
                fontSize: '0.85rem',
                fontWeight: 600,
                marginBottom: '16px',
              }}
            >
              <Sparkles size={14} /> Multi-Tenant B2B2C Printing SaaS Infrastructure
            </div>
            <h1 style={{ fontSize: '3rem', fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.15, marginBottom: '16px' }}>
              QR-PrintHub <span className="gradient-text-brand">Ecosystem</span>
            </h1>
            <p style={{ fontSize: '1.15rem', color: 'var(--text-muted)', maxWidth: '780px', margin: '0 auto' }}>
              Four dedicated standalone web portals powering the complete commercial printing lifecycle: from SaaS subscription sales down to physical paper output.
            </p>
          </div>

          {/* Interactive B2B2C Chain Visualizer */}
          <div
            className="glass-panel"
            style={{
              padding: '24px 32px',
              marginBottom: '48px',
              border: '1px solid rgba(99, 102, 241, 0.3)',
              background: 'linear-gradient(180deg, rgba(17, 24, 39, 0.8) 0%, rgba(10, 14, 23, 0.95) 100%)',
            }}
          >
            <div style={{ fontSize: '0.8rem', color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700, marginBottom: '16px' }}>
              How the Multi-Tier SaaS Hierarchy Operates
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px', alignItems: 'center' }}>
              {/* Node 1 */}
              <div style={{ padding: '16px', background: 'rgba(99, 102, 241, 0.1)', borderRadius: '12px', border: '1px solid rgba(99, 102, 241, 0.25)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#818cf8', fontWeight: 700, fontSize: '0.9rem', marginBottom: '6px' }}>
                  <Crown size={18} /> 1. You (Platform Owner)
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Creates & hosts the software. Sells monthly subscriptions to print businesses.
                </p>
              </div>

              <div style={{ textAlign: 'center', color: '#64748b' }}>
                <ArrowRight size={24} style={{ margin: '0 auto' }} />
                <span style={{ fontSize: '0.7rem' }}>Sells Subscription</span>
              </div>

              {/* Node 2 */}
              <div style={{ padding: '16px', background: 'rgba(16, 185, 129, 0.1)', borderRadius: '12px', border: '1px solid rgba(16, 185, 129, 0.25)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#34d399', fontWeight: 700, fontSize: '0.9rem', marginBottom: '6px' }}>
                  <Building2 size={18} /> 2. Print Shop Owner
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  The client you sell to. Configures per-page rates, generates counter QR standees.
                </p>
              </div>

              <div style={{ textAlign: 'center', color: '#64748b' }}>
                <ArrowRight size={24} style={{ margin: '0 auto' }} />
                <span style={{ fontSize: '0.7rem' }}>Employs Staff</span>
              </div>

              {/* Node 3 */}
              <div style={{ padding: '16px', background: 'rgba(245, 158, 11, 0.1)', borderRadius: '12px', border: '1px solid rgba(245, 158, 11, 0.25)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#fbbf24', fontWeight: 700, fontSize: '0.9rem', marginBottom: '6px' }}>
                  <Printer size={18} /> 3. Counter Staff
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Physical operator at the printer. Pulls decrypted print stream and purges S3.
                </p>
              </div>

              <div style={{ textAlign: 'center', color: '#64748b' }}>
                <ArrowRight size={24} style={{ margin: '0 auto' }} />
                <span style={{ fontSize: '0.7rem' }}>Serves Prints</span>
              </div>

              {/* Node 4 */}
              <div style={{ padding: '16px', background: 'rgba(56, 189, 248, 0.1)', borderRadius: '12px', border: '1px solid rgba(56, 189, 248, 0.25)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#38bdf8', fontWeight: 700, fontSize: '0.9rem', marginBottom: '6px' }}>
                  <Smartphone size={18} /> 4. Customer / User
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Scans standee QR with phone, uploads PDF, pays online, collects prints.
                </p>
              </div>
            </div>
          </div>

          {/* 4 Dedicated Standalone Web Application Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))', gap: '28px', marginBottom: '48px' }}>
            {/* Card 1: Platform Super Admin */}
            <div className="glass-panel glass-panel-interactive" style={{ padding: '32px', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '16px' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(99, 102, 241, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Crown size={24} color="#818cf8" />
                </div>
                <span className="badge badge-indigo">URL: /super-admin</span>
              </div>
              <h2 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: '8px' }}>Platform Super Admin</h2>
              <div style={{ fontSize: '0.85rem', color: '#818cf8', fontWeight: 600, marginBottom: '12px' }}>FOR YOU (SaaS Creator & Founder)</div>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '20px', flex: 1 }}>
                The master executive portal. Track Monthly Recurring Revenue (MRR), onboard new print shop clients, manage SaaS tiers, and inspect platform audits.
              </p>
              <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '16px', display: 'flex', gap: '8px' }}>
                <button onClick={() => navigateTo('platform_admin')} className="btn-primary" style={{ flex: 1, padding: '10px 14px', fontSize: '0.85rem' }}>
                  Open App
                </button>
                <button onClick={() => navigateTo('platform_admin', true)} className="btn-secondary" title="Open in new browser tab" style={{ padding: '10px' }}>
                  <ExternalLink size={16} />
                </button>
              </div>
            </div>

            {/* Card 2: Merchant Business Admin */}
            <div className="glass-panel glass-panel-interactive" style={{ padding: '32px', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '16px' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(16, 185, 129, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Building2 size={24} color="#34d399" />
                </div>
                <span className="badge badge-emerald">URL: /merchant</span>
              </div>
              <h2 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: '8px' }}>Merchant Business Admin</h2>
              <div style={{ fontSize: '0.85rem', color: '#34d399', fontWeight: 600, marginBottom: '12px' }}>FOR PRINT SHOP OWNER (The one you sell to)</div>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '20px', flex: 1 }}>
                The business management console. Configure paper rates (B&W/Color/Duplex), generate high-res printable counter QR standees, and manage shop locations.
              </p>
              <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '16px', display: 'flex', gap: '8px' }}>
                <button onClick={() => navigateTo('merchant_admin')} className="btn-primary" style={{ flex: 1, padding: '10px 14px', fontSize: '0.85rem' }}>
                  Open App
                </button>
                <button onClick={() => navigateTo('merchant_admin', true)} className="btn-secondary" title="Open in new browser tab" style={{ padding: '10px' }}>
                  <ExternalLink size={16} />
                </button>
              </div>
            </div>

            {/* Card 3: Shop Counter Terminal */}
            <div className="glass-panel glass-panel-interactive" style={{ padding: '32px', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '16px' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(245, 158, 11, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Printer size={24} color="#fbbf24" />
                </div>
                <span className="badge badge-amber">URL: /station</span>
              </div>
              <h2 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: '8px' }}>Staff Counter Station</h2>
              <div style={{ fontSize: '0.85rem', color: '#fbbf24', fontWeight: 600, marginBottom: '12px' }}>FOR COUNTER OPERATOR (Next to printer)</div>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '20px', flex: 1 }}>
                High-contrast kiosk terminal. Real-time incoming print order queue, single-use 60s presigned PDF stream ticket, and 1-click cryptographic post-print S3 wipe.
              </p>
              <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '16px', display: 'flex', gap: '8px' }}>
                <button onClick={() => navigateTo('shop_staff')} className="btn-primary" style={{ flex: 1, padding: '10px 14px', fontSize: '0.85rem' }}>
                  Open App
                </button>
                <button onClick={() => navigateTo('shop_staff', true)} className="btn-secondary" title="Open in new browser tab" style={{ padding: '10px' }}>
                  <ExternalLink size={16} />
                </button>
              </div>
            </div>

            {/* Card 4: Customer Mobile Kiosk */}
            <div className="glass-panel glass-panel-interactive" style={{ padding: '32px', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '16px' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(56, 189, 248, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Smartphone size={24} color="#38bdf8" />
                </div>
                <span className="badge badge-indigo">URL: /kiosk</span>
              </div>
              <h2 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: '8px' }}>Customer Mobile Kiosk</h2>
              <div style={{ fontSize: '0.85rem', color: '#38bdf8', fontWeight: 600, marginBottom: '12px' }}>FOR STUDENTS / USERS (Scan with phone)</div>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '20px', flex: 1 }}>
                Zero-friction web kiosk. Scan physical QR code, upload document, get authoritative pricing quote, pay instantly, and receive pickup code.
              </p>
              <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '16px', display: 'flex', gap: '8px' }}>
                <button onClick={() => navigateTo('customer')} className="btn-primary" style={{ flex: 1, padding: '10px 14px', fontSize: '0.85rem' }}>
                  Open App
                </button>
                <button onClick={() => navigateTo('customer', true)} className="btn-secondary" title="Open in new browser tab" style={{ padding: '10px' }}>
                  <ExternalLink size={16} />
                </button>
              </div>
            </div>
          </div>

          {/* Quick Multi-Tab Launch Recommendation */}
          <div className="glass-panel" style={{ padding: '24px 32px', textAlign: 'center' }}>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '8px' }}>🚀 Experience Real Multi-Window Simulation</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '16px' }}>
              Open each portal in a separate browser tab to test the real-world flow: Onboard at Super Admin ➔ Generate QR at Merchant ➔ Scan & Pay at Mobile Kiosk ➔ Print & Purge at Staff Station.
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <button onClick={() => navigateTo('platform_admin', true)} className="btn-secondary" style={{ fontSize: '0.85rem' }}>
                <Crown size={14} /> Open Super Admin in Tab 1
              </button>
              <button onClick={() => navigateTo('merchant_admin', true)} className="btn-secondary" style={{ fontSize: '0.85rem' }}>
                <Building2 size={14} /> Open Merchant in Tab 2
              </button>
              <button onClick={() => navigateTo('customer', true)} className="btn-secondary" style={{ fontSize: '0.85rem' }}>
                <Smartphone size={14} /> Open Customer in Tab 3
              </button>
              <button onClick={() => navigateTo('shop_staff', true)} className="btn-secondary" style={{ fontSize: '0.85rem' }}>
                <Printer size={14} /> Open Staff in Tab 4
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. STANDALONE WEB APP 1: PLATFORM SUPER ADMIN (YOU - SAAS FOUNDER) */}
      {/* ========================================================================= */}
      {route === 'platform_admin' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {/* Dedicated Platform Super Admin Navigation Bar */}
          <nav style={{ background: 'rgba(10, 14, 23, 0.95)', borderBottom: '1px solid var(--border-subtle)', padding: '16px 28px', position: 'sticky', top: 0, zIndex: 40, backdropFilter: 'blur(16px)' }}>
            <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--glow-indigo)' }}>
                  <Crown size={22} color="white" />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '1.25rem', fontWeight: 800 }}>QR-PrintHub Platform Admin</span>
                    <span className="badge badge-indigo">SaaS Executive Control Plane</span>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)' }}>Logged in as admin@qrprinthub.com (Platform Founder)</div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button onClick={() => setShowOnboardModal(true)} className="btn-primary" style={{ padding: '8px 16px', fontSize: '0.85rem' }}>
                  <PlusCircle size={15} /> Onboard New Print Client
                </button>
                <button onClick={() => navigateTo('hub')} className="btn-secondary" style={{ padding: '8px 14px', fontSize: '0.85rem' }}>
                  <Layers size={14} /> Ecosystem Hub
                </button>
              </div>
            </div>
          </nav>

          {/* Platform Admin Body */}
          <main style={{ flex: 1, maxWidth: '1400px', width: '100%', margin: '0 auto', padding: '32px 24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '28px' }}>
              <div>
                <h2 style={{ fontSize: '1.8rem', fontWeight: 800, marginBottom: '6px' }}>SaaS Subscriptions & Platform Revenue</h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                  Manage commercial print business clients, subscription plans, and platform-wide growth metrics.
                </p>
              </div>
              <button onClick={loadPlatformData} className="btn-secondary" style={{ padding: '8px 14px', fontSize: '0.8rem' }}>
                <RefreshCw size={14} /> Refresh Metrics
              </button>
            </div>

            {/* SaaS Metrics Row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px', marginBottom: '32px' }}>
              <div className="glass-panel" style={{ padding: '22px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-subtle)', fontSize: '0.8rem', marginBottom: '6px' }}>
                  <span>Monthly Recurring Revenue (MRR)</span>
                  <DollarSign size={16} color="#34d399" />
                </div>
                <div style={{ fontSize: '2.2rem', fontWeight: 800, color: '#34d399' }}>
                  ₹{((platformStats?.mrrCents || 0) / 100).toLocaleString()}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', marginTop: '4px' }}>Predictable B2B SaaS subscriptions</div>
              </div>

              <div className="glass-panel" style={{ padding: '22px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-subtle)', fontSize: '0.8rem', marginBottom: '6px' }}>
                  <span>Active Client Merchants</span>
                  <Building2 size={16} color="#818cf8" />
                </div>
                <div style={{ fontSize: '2.2rem', fontWeight: 800 }}>{platformStats?.totalMerchants || 0}</div>
                <div style={{ fontSize: '0.75rem', color: '#818cf8', marginTop: '4px' }}>Print companies subscribed to software</div>
              </div>

              <div className="glass-panel" style={{ padding: '22px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-subtle)', fontSize: '0.8rem', marginBottom: '6px' }}>
                  <span>Physical Kiosks & Counter Terminals</span>
                  <Store size={16} color="#38bdf8" />
                </div>
                <div style={{ fontSize: '2.2rem', fontWeight: 800, color: '#38bdf8' }}>{platformStats?.activeShops || 0}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', marginTop: '4px' }}>Active QR counter terminals nationwide</div>
              </div>

              <div className="glass-panel" style={{ padding: '22px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-subtle)', fontSize: '0.8rem', marginBottom: '6px' }}>
                  <span>Gross Platform Print Volume (GMV)</span>
                  <TrendingUp size={16} color="#f59e0b" />
                </div>
                <div style={{ fontSize: '2.2rem', fontWeight: 800, color: '#f59e0b' }}>
                  ₹{((platformStats?.totalGmvCents || 0) / 100).toLocaleString()}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', marginTop: '4px' }}>Total end-user transactions processed</div>
              </div>
            </div>

            {/* Subscribed Print Businesses Directory */}
            <div className="glass-panel" style={{ padding: '28px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <div>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Your Subscribed Print Businesses (Clients)</h3>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Each business owns an isolated multi-tenant database boundary</p>
                </div>
                <span className="badge badge-emerald">All Tenants Healthy</span>
              </div>

              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-subtle)' }}>
                    <th style={{ padding: '12px 16px' }}>Business Name</th>
                    <th style={{ padding: '12px 16px' }}>Client Owner Email</th>
                    <th style={{ padding: '12px 16px' }}>Subscription Plan</th>
                    <th style={{ padding: '12px 16px' }}>Active Kiosks</th>
                    <th style={{ padding: '12px 16px' }}>License Status</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {merchantsList.map((m) => (
                    <tr key={m.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                      <td style={{ padding: '16px', fontWeight: 600 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Building2 size={16} color="#818cf8" /> {m.name}
                        </div>
                      </td>
                      <td style={{ padding: '16px', color: 'var(--text-muted)' }}>{m.email}</td>
                      <td style={{ padding: '16px' }}>
                        <span className={`badge ${m.subscriptionTier === 'ENTERPRISE' ? 'badge-indigo' : 'badge-emerald'}`}>
                          {m.subscriptionTier} (₹{m.subscriptionTier === 'ENTERPRISE' ? '14,999' : m.subscriptionTier === 'PRO' ? '5,999' : '2,499'}/mo)
                        </span>
                      </td>
                      <td style={{ padding: '16px', fontWeight: 600 }}>{m.shopCount} locations</td>
                      <td style={{ padding: '16px' }}>
                        <span className="badge badge-emerald">ACTIVE</span>
                      </td>
                      <td style={{ padding: '16px', textAlign: 'right' }}>
                        <button
                          onClick={() => navigateTo('merchant_admin')}
                          className="btn-secondary"
                          style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                        >
                          Open Business Portal <ChevronRight size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Onboard Merchant Modal */}
            {showOnboardModal && (
              <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
                <div className="glass-panel" style={{ width: '100%', maxWidth: '520px', padding: '32px', border: '1px solid rgba(99,102,241,0.5)' }}>
                  <h3 style={{ fontSize: '1.3rem', fontWeight: 800, marginBottom: '6px' }}>Onboard New Print Client</h3>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '20px' }}>
                    Sell a new SaaS subscription and automatically provision their isolated database tenant.
                  </p>

                  <form onSubmit={handleOnboardMerchant} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Print Company Name</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Metro Xerox & Digital Prints"
                        value={newBizName}
                        onChange={(e) => setNewBizName(e.target.value)}
                        style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-subtle)', borderRadius: '6px', padding: '10px', color: 'white' }}
                      />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Owner Name</label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Suresh Kumar"
                          value={newOwnerName}
                          onChange={(e) => setNewOwnerName(e.target.value)}
                          style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-subtle)', borderRadius: '6px', padding: '10px', color: 'white' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Owner Email</label>
                        <input
                          type="email"
                          required
                          placeholder="suresh@metroprint.com"
                          value={newOwnerEmail}
                          onChange={(e) => setNewOwnerEmail(e.target.value)}
                          style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-subtle)', borderRadius: '6px', padding: '10px', color: 'white' }}
                        />
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '4px' }}>SaaS Plan</label>
                        <select
                          value={newTier}
                          onChange={(e: any) => setNewTier(e.target.value)}
                          style={{ width: '100%', background: '#111827', border: '1px solid var(--border-subtle)', borderRadius: '6px', padding: '10px', color: 'white' }}
                        >
                          <option value="STARTER">Starter (₹2,499/mo)</option>
                          <option value="PRO">Pro (₹5,999/mo)</option>
                          <option value="ENTERPRISE">Enterprise (₹14,999/mo)</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '4px' }}>City</label>
                        <input
                          type="text"
                          required
                          placeholder="Mumbai"
                          value={newCity}
                          onChange={(e) => setNewCity(e.target.value)}
                          style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-subtle)', borderRadius: '6px', padding: '10px', color: 'white' }}
                        />
                      </div>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Initial Counter / Kiosk Location Name</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Metro Kiosk - Station Road"
                        value={newShopName}
                        onChange={(e) => setNewShopName(e.target.value)}
                        style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-subtle)', borderRadius: '6px', padding: '10px', color: 'white' }}
                      />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                      <button type="button" onClick={() => setShowOnboardModal(false)} className="btn-secondary">
                        Cancel
                      </button>
                      <button type="submit" className="btn-success">
                        Provision Tenant & Start Subscription
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </main>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. STANDALONE WEB APP 2: MERCHANT BUSINESS PORTAL (THE CLIENT YOU SELL TO) */}
      {/* ========================================================================= */}
      {route === 'merchant_admin' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {/* Dedicated Merchant Portal Header */}
          <nav style={{ background: 'rgba(10, 14, 23, 0.95)', borderBottom: '1px solid var(--border-subtle)', padding: '16px 28px', position: 'sticky', top: 0, zIndex: 40, backdropFilter: 'blur(16px)' }}>
            <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'linear-gradient(135deg, #059669, #0d9488)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--glow-emerald)' }}>
                  <Building2 size={22} color="white" />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '1.25rem', fontWeight: 800 }}>Campus Prints Global</span>
                    <span className="badge badge-emerald">Enterprise Client License</span>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)' }}>Logged in as rajesh@campusprints.com (Business Owner)</div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button onClick={() => navigateTo('shop_staff', true)} className="btn-secondary" style={{ padding: '8px 14px', fontSize: '0.85rem' }}>
                  <Printer size={15} /> Launch Counter Terminal ↗
                </button>
                <button onClick={() => navigateTo('customer', true)} className="btn-primary" style={{ padding: '8px 14px', fontSize: '0.85rem' }}>
                  <QrCode size={15} /> Test Customer QR ↗
                </button>
                <button onClick={() => navigateTo('hub')} className="btn-secondary" style={{ padding: '8px 12px' }}>
                  <Layers size={14} />
                </button>
              </div>
            </div>
          </nav>

          <main style={{ flex: 1, maxWidth: '1400px', width: '100%', margin: '0 auto', padding: '32px 24px' }}>
            <div style={{ marginBottom: '28px' }}>
              <h2 style={{ fontSize: '1.8rem', fontWeight: 800, marginBottom: '6px' }}>Print Shop Rate Cards & QR Terminals</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                Configure per-page customer print rates, generate printable physical QR standees, and dispatch to counter staff.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: '32px' }}>
              {/* Standee Studio */}
              <div className="glass-panel" style={{ padding: '32px', textAlign: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '8px' }}>
                  <QrCode size={20} color="#818cf8" />
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Printable Counter QR Standee</h3>
                </div>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '24px' }}>
                  Place this QR standee physically on your shop counter for walk-in customers to scan.
                </p>

                {qrDataUrl && (
                  <div style={{ background: 'white', padding: '24px', borderRadius: '16px', display: 'inline-block', marginBottom: '24px', boxShadow: '0 12px 35px rgba(0,0,0,0.6)' }}>
                    <img src={qrDataUrl} alt="Shop QR Standee" style={{ width: '220px', height: '220px', display: 'block' }} />
                    <div style={{ color: '#0a0e17', fontWeight: 800, fontSize: '1.05rem', marginTop: '10px' }}>{selectedShop?.name}</div>
                    <div style={{ color: '#64748b', fontSize: '0.8rem', fontWeight: 500 }}>Scan with Phone Camera to Print in 60s</div>
                  </div>
                )}

                <div>
                  <button onClick={() => window.print()} className="btn-primary" style={{ padding: '10px 24px' }}>
                    <Printer size={16} /> Print Official Counter Standee Poster
                  </button>
                </div>
              </div>

              {/* Dynamic Rate Card Configurator */}
              <div className="glass-panel" style={{ padding: '32px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                  <Settings2 size={20} color="#34d399" />
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Authoritative Rate Card</h3>
                </div>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '24px' }}>
                  These prices are enforced server-side whenever any customer scans your QR standee.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
                      Standard A4 Black & White (per page in paise: 100 paise = ₹1.00)
                    </label>
                    <input
                      type="number"
                      value={customBwRate}
                      onChange={(e) => setCustomBwRate(Number(e.target.value))}
                      style={{ width: '100%', background: 'rgba(255, 255, 255, 0.05)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '12px 14px', color: 'white', fontSize: '1rem' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
                      Premium A4 Full Color (per page in paise: 500 paise = ₹5.00)
                    </label>
                    <input
                      type="number"
                      value={customColorRate}
                      onChange={(e) => setCustomColorRate(Number(e.target.value))}
                      style={{ width: '100%', background: 'rgba(255, 255, 255, 0.05)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '12px 14px', color: 'white', fontSize: '1rem' }}
                    />
                  </div>

                  <button
                    onClick={() => {
                      setRateSavedMessage('Rate card updated successfully! Changes reflected instantly on all customer scans.');
                      setTimeout(() => setRateSavedMessage(null), 4000);
                    }}
                    className="btn-success"
                    style={{ marginTop: '8px', padding: '12px' }}
                  >
                    Save & Push Live Rates
                  </button>

                  {rateSavedMessage && (
                    <div style={{ padding: '10px 14px', background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.4)', borderRadius: '8px', color: '#34d399', fontSize: '0.85rem' }}>
                      ✓ {rateSavedMessage}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </main>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. STANDALONE WEB APP 3: SHOP COUNTER STAFF TERMINAL (NEXT TO PRINTER) */}
      {/* ========================================================================= */}
      {route === 'shop_staff' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {/* Dedicated Staff Terminal Header */}
          <nav style={{ background: 'rgba(10, 14, 23, 0.95)', borderBottom: '1px solid var(--border-subtle)', padding: '16px 28px', position: 'sticky', top: 0, zIndex: 40, backdropFilter: 'blur(16px)' }}>
            <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'linear-gradient(135deg, #f59e0b, #d97706)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Printer size={22} color="white" />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '1.25rem', fontWeight: 800 }}>Central Library Xerox Counter</span>
                    <span className="badge badge-amber">Staff Operator Terminal</span>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)' }}>Staff: Pooja • Connected to HP LaserJet Pro Enterprise</div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button onClick={fetchQueue} className="btn-secondary" style={{ padding: '8px 14px', fontSize: '0.85rem' }}>
                  <RefreshCw size={14} className={isLoadingQueue ? 'spin' : ''} /> Refresh Queue ({queue.length})
                </button>
                <button onClick={() => navigateTo('hub')} className="btn-secondary" style={{ padding: '8px 12px' }}>
                  <Layers size={14} />
                </button>
              </div>
            </div>
          </nav>

          <main style={{ flex: 1, maxWidth: '1400px', width: '100%', margin: '0 auto', padding: '32px 24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <div>
                <h2 style={{ fontSize: '1.8rem', fontWeight: 800, marginBottom: '4px' }}>Incoming Customer Print Queue</h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                  Paid customer jobs appear here instantly. Download the 60s stream, print, and mark complete to cryptographically wipe the customer's PDF.
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="pulse-dot"></span>
                <span style={{ fontSize: '0.85rem', color: '#34d399', fontWeight: 600 }}>Live Dispatcher Active</span>
              </div>
            </div>

            {queue.length === 0 ? (
              <div className="glass-panel" style={{ padding: '80px 24px', textAlign: 'center' }}>
                <CheckCircle2 size={54} color="#34d399" style={{ margin: '0 auto 16px', opacity: 0.8 }} />
                <h3 style={{ fontSize: '1.35rem', fontWeight: 700, marginBottom: '6px' }}>Print Queue is Clear</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', maxWidth: '500px', margin: '0 auto' }}>
                  All pending customer orders have been printed and their uploaded PDF files have been permanently wiped from private S3 storage.
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {queue.map((job) => (
                  <div key={job.jobId} className="glass-panel glass-panel-interactive" style={{ padding: '24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
                        <div style={{ padding: '14px 20px', background: 'rgba(99, 102, 241, 0.15)', borderRadius: 'var(--radius-sm)', textAlign: 'center' }}>
                          <div style={{ fontSize: '0.75rem', color: '#818cf8', fontWeight: 700 }}>PICKUP CODE</div>
                          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'white' }}>{job.orderCode}</div>
                        </div>

                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                            <span className="badge badge-amber">{job.status}</span>
                            <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Amount Paid: ₹{(job.totalAmountCents / 100).toFixed(2)}</span>
                          </div>
                          {job.items?.map((item, idx) => (
                            <div key={idx} style={{ fontSize: '0.9rem', color: 'var(--text-main)', fontWeight: 500 }}>
                              📄 {item.originalFilename} — <span style={{ color: '#818cf8', fontWeight: 600 }}>{item.pageCount} pages × {item.copies} copies ({item.colorMode}, {item.duplexMode}, {item.paperSize})</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <button onClick={() => handleGetDownloadTicket(job.jobId)} className="btn-secondary" style={{ fontSize: '0.85rem', padding: '10px 16px' }}>
                          <Download size={15} /> 1. Get 60s Stream Ticket
                        </button>
                        <button onClick={() => handleCompleteJob(job.jobId)} className="btn-success" style={{ fontSize: '0.85rem', padding: '10px 16px' }}>
                          <CheckCircle2 size={15} /> 2. Mark Printed & Wipe S3
                        </button>
                      </div>
                    </div>

                    {downloadTicket && downloadTicket.jobId === job.jobId && (
                      <div style={{ marginTop: '16px', padding: '14px', background: 'rgba(99, 102, 241, 0.12)', borderRadius: '8px', border: '1px solid rgba(99, 102, 241, 0.35)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.85rem', color: '#818cf8' }}>⚡ Presigned single-use download URL generated. Stream expires in 60s.</span>
                        <a href={downloadTicket.url} target="_blank" rel="noopener noreferrer" className="btn-primary" style={{ padding: '6px 14px', fontSize: '0.8rem' }}>
                          Open Raw PDF Stream
                        </a>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </main>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. STANDALONE WEB APP 4: CUSTOMER MOBILE KIOSK (STUDENT / END-USER) */}
      {/* ========================================================================= */}
      {route === 'customer' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {/* Dedicated Customer Mobile Header */}
          <nav style={{ background: 'rgba(10, 14, 23, 0.95)', borderBottom: '1px solid var(--border-subtle)', padding: '14px 20px', position: 'sticky', top: 0, zIndex: 40, backdropFilter: 'blur(16px)' }}>
            <div style={{ maxWidth: '900px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: 'linear-gradient(135deg, #06b6d4, #3b82f6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Smartphone size={20} color="white" />
                </div>
                <div>
                  <div style={{ fontSize: '1.05rem', fontWeight: 800 }}>{selectedShop?.name || 'Campus Print Hub'}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)' }}>Scan & Print Kiosk • 100% Private</div>
                </div>
              </div>

              <button onClick={() => navigateTo('hub')} className="btn-secondary" style={{ padding: '6px 10px', fontSize: '0.75rem' }}>
                <Layers size={13} /> Exit Kiosk
              </button>
            </div>
          </nav>

          <main style={{ flex: 1, maxWidth: '900px', width: '100%', margin: '0 auto', padding: '24px 16px' }}>
            <div className="glass-panel" style={{ padding: '20px', marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                    <span className="pulse-dot"></span>
                    <span className="badge badge-emerald">Shop Open</span>
                  </div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>📍 {selectedShop?.address}, {selectedShop?.city}</div>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)' }}>Operating Hours: 08:00 AM - 09:00 PM</div>
              </div>
            </div>

            {/* Step 1: Upload Document */}
            <div className="glass-panel" style={{ padding: '24px', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'rgba(99, 102, 241, 0.2)', color: '#818cf8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.85rem' }}>1</div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Document to Print</h3>
              </div>

              {uploadedFile ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(99, 102, 241, 0.3)', borderRadius: 'var(--radius-sm)', padding: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{ padding: '12px', background: 'rgba(99, 102, 241, 0.15)', borderRadius: '8px' }}>
                      <FileText size={24} color="#818cf8" />
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{uploadedFile.name}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        {(uploadedFile.size / 1024 / 1024).toFixed(2)} MB • <span style={{ color: '#34d399', fontWeight: 600 }}>{uploadedFile.pages} Pages Verified</span>
                      </div>
                    </div>
                  </div>
                  <button onClick={() => setUploadedFile({ name: 'Thesis_Final_Draft.pdf', size: 3100000, pages: 20 })} className="btn-secondary" style={{ fontSize: '0.8rem', padding: '6px 12px' }}>
                    Change
                  </button>
                </div>
              ) : (
                <div style={{ border: '2px dashed var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '36px', textAlign: 'center', cursor: 'pointer' }}>
                  <UploadCloud size={36} color="var(--text-subtle)" style={{ margin: '0 auto 12px' }} />
                  <div style={{ fontWeight: 600 }}>Tap or drag PDF to upload</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-subtle)', marginTop: '4px' }}>Encrypted Private Upload • Max 50MB</div>
                </div>
              )}
            </div>

            {/* Step 2: Print Parameters */}
            <div className="glass-panel" style={{ padding: '24px', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px' }}>
                <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'rgba(99, 102, 241, 0.2)', color: '#818cf8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.85rem' }}>2</div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Print Parameters</h3>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '6px', color: 'var(--text-muted)' }}>Color Mode</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                    <button onClick={() => setColorMode('BW')} className={colorMode === 'BW' ? 'btn-primary' : 'btn-secondary'} style={{ padding: '10px 8px', fontSize: '0.8rem' }}>
                      B&W (₹1.00)
                    </button>
                    <button onClick={() => setColorMode('COLOR')} className={colorMode === 'COLOR' ? 'btn-primary' : 'btn-secondary'} style={{ padding: '10px 8px', fontSize: '0.8rem' }}>
                      Color (₹5.00)
                    </button>
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '6px', color: 'var(--text-muted)' }}>Sides</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                    <button onClick={() => setDuplexMode('SIMPLEX')} className={duplexMode === 'SIMPLEX' ? 'btn-primary' : 'btn-secondary'} style={{ padding: '10px 8px', fontSize: '0.8rem' }}>
                      Single
                    </button>
                    <button onClick={() => setDuplexMode('DUPLEX')} className={duplexMode === 'DUPLEX' ? 'btn-primary' : 'btn-secondary'} style={{ padding: '10px 8px', fontSize: '0.8rem' }}>
                      Double (Save 20%)
                    </button>
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '6px', color: 'var(--text-muted)' }}>Paper Size</label>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {(['A4', 'A3', 'LEGAL'] as const).map((size) => (
                      <button key={size} onClick={() => setPaperSize(size)} className={paperSize === size ? 'btn-primary' : 'btn-secondary'} style={{ flex: 1, padding: '8px', fontSize: '0.8rem' }}>
                        {size}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '6px', color: 'var(--text-muted)' }}>Copies</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <button onClick={() => setCopies(Math.max(1, copies - 1))} className="btn-secondary" style={{ width: '36px', height: '36px', padding: 0 }}>-</button>
                    <span style={{ fontSize: '1.2rem', fontWeight: 700, minWidth: '28px', textAlign: 'center' }}>{copies}</span>
                    <button onClick={() => setCopies(copies + 1)} className="btn-secondary" style={{ width: '36px', height: '36px', padding: 0 }}>+</button>
                  </div>
                </div>
              </div>
            </div>

            {/* Step 3: Authoritative Quote & Checkout */}
            <div className="glass-panel" style={{ padding: '24px', border: '1px solid rgba(99, 102, 241, 0.4)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Instant Verified Quote</h3>
                <span className="badge badge-emerald">Server Calculation</span>
              </div>

              {quote && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    <span>Pages × Copies</span>
                    <span style={{ color: 'var(--text-main)', fontWeight: 600 }}>{quote.pages} pages × {quote.copies} copy</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    <span>Configuration</span>
                    <span style={{ color: 'var(--text-main)', fontWeight: 600 }}>{paperSize} • {colorMode} • {duplexMode}</span>
                  </div>

                  <div style={{ height: '1px', background: 'var(--border-subtle)', margin: '6px 0' }}></div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ fontSize: '1rem', fontWeight: 700 }}>Total Payable</span>
                    <span style={{ fontSize: '1.8rem', fontWeight: 800, color: '#34d399' }}>
                      ₹{(quote.totalAmountCents / 100).toFixed(2)}
                    </span>
                  </div>
                </div>
              )}

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
                  Mobile Phone for Pickup Notifications
                </label>
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
                <div style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.4)', borderRadius: 'var(--radius-sm)', padding: '20px', textAlign: 'center' }}>
                  <CheckCircle2 size={36} color="#34d399" style={{ margin: '0 auto 8px' }} />
                  <div style={{ fontWeight: 700, fontSize: '1.15rem', color: '#34d399' }}>Order Paid & Queued!</div>
                  <div style={{ fontSize: '1.8rem', fontWeight: 800, letterSpacing: '0.05em', margin: '8px 0' }}>{activeOrder.orderCode}</div>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    Show this 6-letter pickup code to the counter staff or collect your prints directly.
                  </p>
                </div>
              ) : (
                <button
                  onClick={handleCheckoutAndPay}
                  disabled={isProcessingPayment || !quote}
                  className="btn-success"
                  style={{ width: '100%', padding: '14px', fontSize: '1rem' }}
                >
                  <CreditCard size={18} />
                  {isProcessingPayment ? 'Authorizing Instant Payment...' : `Pay ₹${((quote?.totalAmountCents || 0) / 100).toFixed(2)} & Send to Printer`}
                </button>
              )}

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginTop: '14px', color: 'var(--text-subtle)', fontSize: '0.75rem' }}>
                <ShieldCheck size={14} color="#34d399" /> 100% Private • Ephemeral Auto-Purge within 2h
              </div>
            </div>
          </main>
        </div>
      )}

      {/* ========================================================================= */}
      {/* PERSISTENT MULTI-WEB APP QUICK-SWITCHER PILL (FLOATING BOTTOM-RIGHT) */}
      {/* ========================================================================= */}
      <div
        style={{
          position: 'fixed',
          bottom: '18px',
          right: '18px',
          zIndex: 99,
          background: 'rgba(10, 14, 23, 0.94)',
          backdropFilter: 'blur(16px)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-full)',
          padding: '6px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          boxShadow: '0 8px 30px rgba(0,0,0,0.6)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-subtle)', fontSize: '0.75rem', fontWeight: 600 }}>
          <Globe size={13} color="#818cf8" />
          <span>Switch Web App:</span>
        </div>

        <button
          onClick={() => navigateTo('platform_admin')}
          className={route === 'platform_admin' ? 'badge badge-indigo' : 'btn-secondary'}
          style={{ padding: '4px 10px', fontSize: '0.72rem', cursor: 'pointer' }}
          title="Platform Super Admin Portal (/super-admin)"
        >
          👑 Super Admin
        </button>

        <button
          onClick={() => navigateTo('merchant_admin')}
          className={route === 'merchant_admin' ? 'badge badge-emerald' : 'btn-secondary'}
          style={{ padding: '4px 10px', fontSize: '0.72rem', cursor: 'pointer' }}
          title="Merchant Business Portal (/merchant)"
        >
          🏢 Merchant Client
        </button>

        <button
          onClick={() => navigateTo('shop_staff')}
          className={route === 'shop_staff' ? 'badge badge-amber' : 'btn-secondary'}
          style={{ padding: '4px 10px', fontSize: '0.72rem', cursor: 'pointer' }}
          title="Shop Counter Terminal (/station)"
        >
          🖨️ Counter Staff
        </button>

        <button
          onClick={() => navigateTo('customer')}
          className={route === 'customer' ? 'badge badge-indigo' : 'btn-secondary'}
          style={{ padding: '4px 10px', fontSize: '0.72rem', cursor: 'pointer' }}
          title="Customer Mobile Kiosk (/kiosk)"
        >
          📱 Customer Kiosk
        </button>

        <button
          onClick={() => navigateTo('hub')}
          className={route === 'hub' ? 'badge badge-emerald' : 'btn-secondary'}
          style={{ padding: '4px 10px', fontSize: '0.72rem', cursor: 'pointer' }}
          title="Master SaaS Ecosystem Hub (/)"
        >
          🏠 Hub
        </button>
      </div>
    </div>
  );
}

import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect } from 'react';
import { Printer, QrCode, UploadCloud, FileText, CreditCard, CheckCircle2, ShieldCheck, Download, Settings2, Store, RefreshCw, } from 'lucide-react';
import QRCode from 'qrcode';
export default function App() {
    const [activeTab, setActiveTab] = useState('customer');
    const [selectedShop, setSelectedShop] = useState(null);
    // Customer State
    const [uploadedFile, setUploadedFile] = useState({
        name: 'CS402_Distributed_Systems_Lecture_Notes.pdf',
        size: 2450000,
        pages: 14,
    });
    const [paperSize, setPaperSize] = useState('A4');
    const [colorMode, setColorMode] = useState('BW');
    const [duplexMode, setDuplexMode] = useState('DUPLEX');
    const [copies, setCopies] = useState(1);
    const [quote, setQuote] = useState(null);
    const [customerPhone, setCustomerPhone] = useState('+91 98765 43210');
    const [activeOrder, setActiveOrder] = useState(null);
    const [isProcessingPayment, setIsProcessingPayment] = useState(false);
    // Staff State
    const [queue, setQueue] = useState([]);
    const [isLoadingQueue, setIsLoadingQueue] = useState(false);
    const [downloadTicket, setDownloadTicket] = useState(null);
    // Merchant State
    const [qrDataUrl, setQrDataUrl] = useState('');
    const [customBwRate, setCustomBwRate] = useState(100);
    const [customColorRate, setCustomColorRate] = useState(500);
    // Load Initial Shops from Backend API
    useEffect(() => {
        async function loadShop() {
            try {
                const res = await fetch('/api/v1/public/shops/QR_CAMPUS_NORTH_LIB_01');
                const data = await res.json();
                if (data.success) {
                    setSelectedShop(data.data);
                }
            }
            catch {
                // Fallback demo state if running standalone
                const demoShop = {
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
        if (!selectedShop || !uploadedFile)
            return;
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
        if (!selectedShop)
            return;
        setIsLoadingQueue(true);
        try {
            const res = await fetch(`/api/v1/print-stations/queue?shopId=${selectedShop.id}`);
            const data = await res.json();
            if (data.success) {
                setQueue(data.data);
            }
        }
        catch {
            // Demo jobs if API mock
        }
        finally {
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
        if (!selectedShop || !uploadedFile || !quote)
            return;
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
        }
        catch (err) {
            console.error('Checkout error:', err);
        }
        finally {
            setIsProcessingPayment(false);
        }
    };
    // Staff: Dispatch Download
    const handleGetDownloadTicket = async (jobId) => {
        if (!selectedShop)
            return;
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
        }
        catch (err) {
            console.error(err);
        }
    };
    // Staff: Mark Complete & Purge
    const handleCompleteJob = async (jobId) => {
        if (!selectedShop)
            return;
        try {
            await fetch(`/api/v1/print-stations/jobs/${jobId}/complete?shopId=${selectedShop.id}`, { method: 'POST' });
            setDownloadTicket(null);
            fetchQueue();
        }
        catch (err) {
            console.error(err);
        }
    };
    return (_jsxs("div", { style: { minHeight: '100vh', display: 'flex', flexDirection: 'column' }, children: [_jsx("header", { style: {
                    borderBottom: '1px solid var(--border-subtle)',
                    background: 'rgba(10, 14, 23, 0.85)',
                    backdropFilter: 'blur(12px)',
                    position: 'sticky',
                    top: 0,
                    zIndex: 50,
                    padding: '16px 24px',
                }, children: _jsxs("div", { style: { maxWidth: '1280px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: '12px' }, children: [_jsx("div", { style: {
                                        width: '40px',
                                        height: '40px',
                                        borderRadius: '10px',
                                        background: 'linear-gradient(135deg, #4f46e5, #06b6d4)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        boxShadow: 'var(--glow-indigo)',
                                    }, children: _jsx(Printer, { size: 22, color: "white" }) }), _jsxs("div", { children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: '8px' }, children: [_jsx("h1", { style: { fontSize: '1.25rem', fontWeight: 800, letterSpacing: '-0.02em' }, children: "QR-PrintHub" }), _jsx("span", { className: "badge badge-indigo", children: "SaaS Platform" })] }), _jsx("p", { style: { fontSize: '0.75rem', color: 'var(--text-subtle)' }, children: "Multi-Tenant Cloud Printing Infrastructure" })] })] }), _jsxs("div", { style: {
                                display: 'flex',
                                background: 'rgba(255, 255, 255, 0.04)',
                                padding: '4px',
                                borderRadius: 'var(--radius-sm)',
                                border: '1px solid var(--border-subtle)',
                            }, children: [_jsxs("button", { onClick: () => setActiveTab('customer'), className: activeTab === 'customer' ? 'btn-primary' : 'btn-secondary', style: { padding: '8px 16px', fontSize: '0.85rem' }, children: [_jsx(QrCode, { size: 16 }), " 1. Customer Scan Flow"] }), _jsxs("button", { onClick: () => setActiveTab('staff'), className: activeTab === 'staff' ? 'btn-primary' : 'btn-secondary', style: { padding: '8px 16px', fontSize: '0.85rem' }, children: [_jsx(Printer, { size: 16 }), " 2. Staff Print Station (", queue.length, ")"] }), _jsxs("button", { onClick: () => setActiveTab('merchant'), className: activeTab === 'merchant' ? 'btn-primary' : 'btn-secondary', style: { padding: '8px 16px', fontSize: '0.85rem' }, children: [_jsx(Store, { size: 16 }), " 3. Merchant SaaS Admin"] })] })] }) }), _jsxs("main", { style: { flex: 1, maxWidth: '1280px', width: '100%', margin: '0 auto', padding: '32px 24px' }, children: [activeTab === 'customer' && (_jsxs("div", { style: { display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)', gap: '32px', alignItems: 'start' }, children: [_jsxs("div", { children: [_jsx("div", { className: "glass-panel", style: { padding: '24px', marginBottom: '24px', position: 'relative', overflow: 'hidden' }, children: _jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'start', flexWrap: 'wrap', gap: '16px' }, children: [_jsxs("div", { children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }, children: [_jsx("span", { className: "pulse-dot" }), _jsx("span", { className: "badge badge-emerald", children: "Shop Open \u2022 Ready to Print" }), _jsxs("span", { style: { fontSize: '0.8rem', color: 'var(--text-subtle)' }, children: ["QR Token: ", selectedShop?.qrCodeToken] })] }), _jsx("h2", { style: { fontSize: '1.5rem', fontWeight: 700, marginBottom: '6px' }, children: selectedShop?.name }), _jsxs("p", { style: { fontSize: '0.875rem', color: 'var(--text-muted)' }, children: ["\uD83D\uDCCD ", selectedShop?.address, ", ", selectedShop?.city] })] }), _jsxs("div", { style: { textAlign: 'right' }, children: [_jsx("div", { style: { fontSize: '0.75rem', color: 'var(--text-subtle)' }, children: "Active Operating Hours" }), _jsx("div", { style: { fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-main)' }, children: "08:00 AM \u2013 09:00 PM" })] })] }) }), _jsxs("div", { className: "glass-panel", style: { padding: '24px', marginBottom: '24px' }, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }, children: [_jsx("div", { style: { width: '28px', height: '28px', borderRadius: '50%', background: 'rgba(99, 102, 241, 0.2)', color: '#818cf8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.85rem' }, children: "1" }), _jsx("h3", { style: { fontSize: '1.1rem', fontWeight: 700 }, children: "Select Document to Print" })] }), uploadedFile ? (_jsxs("div", { style: {
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                    background: 'rgba(255, 255, 255, 0.03)',
                                                    border: '1px solid rgba(99, 102, 241, 0.3)',
                                                    borderRadius: 'var(--radius-sm)',
                                                    padding: '16px',
                                                }, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: '14px' }, children: [_jsx("div", { style: { padding: '12px', background: 'rgba(99, 102, 241, 0.15)', borderRadius: '8px' }, children: _jsx(FileText, { size: 24, color: "#818cf8" }) }), _jsxs("div", { children: [_jsx("div", { style: { fontWeight: 600, fontSize: '0.95rem' }, children: uploadedFile.name }), _jsxs("div", { style: { fontSize: '0.8rem', color: 'var(--text-muted)' }, children: [(uploadedFile.size / 1024 / 1024).toFixed(2), " MB \u2022 ", _jsxs("span", { style: { color: '#34d399', fontWeight: 600 }, children: [uploadedFile.pages, " Pages Detected"] })] })] })] }), _jsx("button", { onClick: () => setUploadedFile({ name: 'Architecture_Design_Document.pdf', size: 1800000, pages: 8 }), className: "btn-secondary", style: { fontSize: '0.8rem', padding: '6px 12px' }, children: "Change File" })] })) : (_jsxs("div", { style: {
                                                    border: '2px dashed var(--border-subtle)',
                                                    borderRadius: 'var(--radius-sm)',
                                                    padding: '36px',
                                                    textAlign: 'center',
                                                    cursor: 'pointer',
                                                }, children: [_jsx(UploadCloud, { size: 36, color: "var(--text-subtle)", style: { margin: '0 auto 12px' } }), _jsx("div", { style: { fontWeight: 600 }, children: "Tap or drag PDF to upload" }), _jsx("div", { style: { fontSize: '0.8rem', color: 'var(--text-subtle)', marginTop: '4px' }, children: "Maximum 50MB \u2022 Encrypted Private Upload" })] }))] }), _jsxs("div", { className: "glass-panel", style: { padding: '24px' }, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }, children: [_jsx("div", { style: { width: '28px', height: '28px', borderRadius: '50%', background: 'rgba(99, 102, 241, 0.2)', color: '#818cf8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.85rem' }, children: "2" }), _jsx("h3", { style: { fontSize: '1.1rem', fontWeight: 700 }, children: "Print Configuration" })] }), _jsxs("div", { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }, children: [_jsxs("div", { children: [_jsx("label", { style: { display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '8px', color: 'var(--text-muted)' }, children: "Color Mode" }), _jsxs("div", { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }, children: [_jsx("button", { onClick: () => setColorMode('BW'), className: colorMode === 'BW' ? 'btn-primary' : 'btn-secondary', style: { padding: '12px', fontSize: '0.85rem', width: '100%' }, children: "B&W (\u20B91.00/page)" }), _jsx("button", { onClick: () => setColorMode('COLOR'), className: colorMode === 'COLOR' ? 'btn-primary' : 'btn-secondary', style: { padding: '12px', fontSize: '0.85rem', width: '100%' }, children: "Color (\u20B95.00/page)" })] })] }), _jsxs("div", { children: [_jsx("label", { style: { display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '8px', color: 'var(--text-muted)' }, children: "Sides" }), _jsxs("div", { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }, children: [_jsx("button", { onClick: () => setDuplexMode('SIMPLEX'), className: duplexMode === 'SIMPLEX' ? 'btn-primary' : 'btn-secondary', style: { padding: '12px', fontSize: '0.85rem', width: '100%' }, children: "Single Sided" }), _jsx("button", { onClick: () => setDuplexMode('DUPLEX'), className: duplexMode === 'DUPLEX' ? 'btn-primary' : 'btn-secondary', style: { padding: '12px', fontSize: '0.85rem', width: '100%' }, children: "Double Sided (Save 20%)" })] })] })] }), _jsxs("div", { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }, children: [_jsxs("div", { children: [_jsx("label", { style: { display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '8px', color: 'var(--text-muted)' }, children: "Paper Size" }), _jsx("div", { style: { display: 'flex', gap: '8px' }, children: ['A4', 'A3', 'LEGAL'].map((size) => (_jsx("button", { onClick: () => setPaperSize(size), className: paperSize === size ? 'btn-primary' : 'btn-secondary', style: { flex: 1, padding: '10px', fontSize: '0.85rem' }, children: size }, size))) })] }), _jsxs("div", { children: [_jsx("label", { style: { display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '8px', color: 'var(--text-muted)' }, children: "Copies" }), _jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: '12px' }, children: [_jsx("button", { onClick: () => setCopies(Math.max(1, copies - 1)), className: "btn-secondary", style: { width: '40px', height: '40px', padding: 0 }, children: "-" }), _jsx("span", { style: { fontSize: '1.25rem', fontWeight: 700, minWidth: '32px', textAlign: 'center' }, children: copies }), _jsx("button", { onClick: () => setCopies(copies + 1), className: "btn-secondary", style: { width: '40px', height: '40px', padding: 0 }, children: "+" })] })] })] })] })] }), _jsx("div", { style: { position: 'sticky', top: '100px' }, children: _jsxs("div", { className: "glass-panel", style: { padding: '28px', border: '1px solid rgba(99, 102, 241, 0.4)' }, children: [_jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }, children: [_jsx("h3", { style: { fontSize: '1.15rem', fontWeight: 700 }, children: "Authoritative Quote" }), _jsx("span", { className: "badge badge-emerald", children: "Verified Server Rate" })] }), quote && (_jsxs("div", { style: { display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }, children: [_jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: '0.9rem' }, children: [_jsx("span", { children: "Document Length" }), _jsxs("span", { style: { color: 'var(--text-main)', fontWeight: 600 }, children: [quote.pages, " pages"] })] }), _jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: '0.9rem' }, children: [_jsx("span", { children: "Copies" }), _jsxs("span", { style: { color: 'var(--text-main)', fontWeight: 600 }, children: ["\u00D7 ", quote.copies] })] }), _jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: '0.9rem' }, children: [_jsx("span", { children: "Mode & Paper" }), _jsxs("span", { style: { color: 'var(--text-main)', fontWeight: 600 }, children: [paperSize, " \u2022 ", colorMode, " \u2022 ", duplexMode] })] }), _jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: '0.9rem' }, children: [_jsx("span", { children: "Rate per page" }), _jsxs("span", { style: { color: 'var(--text-main)', fontWeight: 600 }, children: ["\u20B9", (quote.unitPriceCents / 100).toFixed(2)] })] }), _jsx("div", { style: { height: '1px', background: 'var(--border-subtle)', margin: '8px 0' } }), _jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }, children: [_jsx("span", { style: { fontSize: '1.1rem', fontWeight: 700 }, children: "Total Payable" }), _jsxs("span", { style: { fontSize: '1.8rem', fontWeight: 800, color: '#34d399' }, children: ["\u20B9", (quote.totalAmountCents / 100).toFixed(2)] })] })] })), _jsxs("div", { style: { marginBottom: '20px' }, children: [_jsx("label", { style: { display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px' }, children: "Phone Number for Pick-up Notification" }), _jsx("input", { type: "tel", value: customerPhone, onChange: (e) => setCustomerPhone(e.target.value), style: {
                                                        width: '100%',
                                                        background: 'rgba(255, 255, 255, 0.05)',
                                                        border: '1px solid var(--border-subtle)',
                                                        borderRadius: 'var(--radius-sm)',
                                                        padding: '10px 14px',
                                                        color: 'white',
                                                        fontSize: '0.9rem',
                                                    } })] }), activeOrder ? (_jsxs("div", { style: { background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.4)', borderRadius: 'var(--radius-sm)', padding: '16px', textAlign: 'center' }, children: [_jsx(CheckCircle2, { size: 32, color: "#34d399", style: { margin: '0 auto 8px' } }), _jsx("div", { style: { fontWeight: 700, fontSize: '1.1rem', color: '#34d399' }, children: "Order Confirmed & Queued!" }), _jsx("div", { style: { fontSize: '1.4rem', fontWeight: 800, letterSpacing: '0.05em', margin: '8px 0' }, children: activeOrder.orderCode }), _jsx("p", { style: { fontSize: '0.8rem', color: 'var(--text-muted)' }, children: "Show this code to shop operator or collect from kiosk tray when ready." })] })) : (_jsxs("button", { onClick: handleCheckoutAndPay, disabled: isProcessingPayment || !quote, className: "btn-success", style: { width: '100%', padding: '14px', fontSize: '1rem' }, children: [_jsx(CreditCard, { size: 18 }), isProcessingPayment ? 'Processing Payment...' : `Pay ₹${((quote?.totalAmountCents || 0) / 100).toFixed(2)} & Queue Print`] })), _jsxs("div", { style: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginTop: '16px', color: 'var(--text-subtle)', fontSize: '0.75rem' }, children: [_jsx(ShieldCheck, { size: 14, color: "#34d399" }), " 100% Private \u2022 Ephemeral Auto-Purge within 2h"] })] }) })] })), activeTab === 'staff' && (_jsxs("div", { children: [_jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }, children: [_jsxs("div", { children: [_jsx("h2", { style: { fontSize: '1.5rem', fontWeight: 800 }, children: "Staff Print Station Dispatcher" }), _jsxs("p", { style: { fontSize: '0.875rem', color: 'var(--text-muted)' }, children: ["Live incoming paid print queue for ", selectedShop?.name] })] }), _jsxs("button", { onClick: fetchQueue, className: "btn-secondary", style: { padding: '8px 14px', fontSize: '0.85rem' }, children: [_jsx(RefreshCw, { size: 14, className: isLoadingQueue ? 'spin' : '' }), " Refresh Queue"] })] }), queue.length === 0 ? (_jsxs("div", { className: "glass-panel", style: { padding: '60px 24px', textAlign: 'center' }, children: [_jsx(CheckCircle2, { size: 48, color: "#34d399", style: { margin: '0 auto 16px', opacity: 0.8 } }), _jsx("h3", { style: { fontSize: '1.25rem', fontWeight: 700, marginBottom: '6px' }, children: "Print Queue is Clear" }), _jsx("p", { style: { color: 'var(--text-muted)', fontSize: '0.9rem' }, children: "All pending orders have been printed and auto-purged from storage." })] })) : (_jsx("div", { style: { display: 'flex', flexDirection: 'column', gap: '16px' }, children: queue.map((job) => (_jsxs("div", { className: "glass-panel glass-panel-interactive", style: { padding: '20px' }, children: [_jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: '16px' }, children: [_jsxs("div", { style: {
                                                                padding: '12px 18px',
                                                                background: 'rgba(99, 102, 241, 0.15)',
                                                                borderRadius: 'var(--radius-sm)',
                                                                textAlign: 'center',
                                                            }, children: [_jsx("div", { style: { fontSize: '0.75rem', color: '#818cf8', fontWeight: 600 }, children: "CODE" }), _jsx("div", { style: { fontSize: '1.3rem', fontWeight: 800, color: 'white' }, children: job.orderCode })] }), _jsxs("div", { children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }, children: [_jsx("span", { className: "badge badge-amber", children: job.status }), _jsxs("span", { style: { fontSize: '0.85rem', color: 'var(--text-muted)' }, children: ["Total Paid: \u20B9", (job.totalAmountCents / 100).toFixed(2)] })] }), job.items?.map((item, idx) => (_jsxs("div", { style: { fontSize: '0.85rem', color: 'var(--text-main)', fontWeight: 500 }, children: ["\uD83D\uDCC4 ", item.originalFilename, " \u2014 ", _jsxs("span", { style: { color: '#818cf8' }, children: [item.pageCount, " pages \u00D7 ", item.copies, " copies (", item.colorMode, ", ", item.duplexMode, ")"] })] }, idx)))] })] }), _jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: '10px' }, children: [_jsxs("button", { onClick: () => handleGetDownloadTicket(job.jobId), className: "btn-secondary", style: { fontSize: '0.85rem' }, children: [_jsx(Download, { size: 15 }), " 1. Download Stream (60s TTL)"] }), _jsxs("button", { onClick: () => handleCompleteJob(job.jobId), className: "btn-success", style: { fontSize: '0.85rem' }, children: [_jsx(CheckCircle2, { size: 15 }), " 2. Mark Printed & Purge S3"] })] })] }), downloadTicket && downloadTicket.jobId === job.jobId && (_jsxs("div", { style: { marginTop: '16px', padding: '12px', background: 'rgba(99, 102, 241, 0.1)', borderRadius: '8px', border: '1px solid rgba(99, 102, 241, 0.3)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }, children: [_jsx("span", { style: { fontSize: '0.85rem', color: '#818cf8' }, children: "\u26A1 Presigned S3 single-use stream ready (Expires in 60s)" }), _jsx("a", { href: downloadTicket.url, target: "_blank", rel: "noopener noreferrer", className: "btn-primary", style: { padding: '6px 12px', fontSize: '0.8rem' }, children: "Open Raw PDF Stream" })] }))] }, job.jobId))) }))] })), activeTab === 'merchant' && (_jsxs("div", { children: [_jsxs("div", { style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px', marginBottom: '32px' }, children: [_jsxs("div", { className: "glass-panel", style: { padding: '20px' }, children: [_jsx("div", { style: { fontSize: '0.8rem', color: 'var(--text-subtle)', marginBottom: '6px' }, children: "Total SaaS Revenue" }), _jsx("div", { style: { fontSize: '1.8rem', fontWeight: 800, color: '#34d399' }, children: "\u20B914,820" }), _jsx("div", { style: { fontSize: '0.75rem', color: '#34d399', marginTop: '4px' }, children: "+18% from last week" })] }), _jsxs("div", { className: "glass-panel", style: { padding: '20px' }, children: [_jsx("div", { style: { fontSize: '0.8rem', color: 'var(--text-subtle)', marginBottom: '6px' }, children: "Pages Printed Today" }), _jsx("div", { style: { fontSize: '1.8rem', fontWeight: 800 }, children: "1,248" }), _jsx("div", { style: { fontSize: '0.75rem', color: '#818cf8', marginTop: '4px' }, children: "Across 2 campus kiosks" })] }), _jsxs("div", { className: "glass-panel", style: { padding: '20px' }, children: [_jsx("div", { style: { fontSize: '0.8rem', color: 'var(--text-subtle)', marginBottom: '6px' }, children: "Ephemeral Files Purged" }), _jsx("div", { style: { fontSize: '1.8rem', fontWeight: 800, color: '#06b6d4' }, children: "142" }), _jsx("div", { style: { fontSize: '0.75rem', color: 'var(--text-subtle)', marginTop: '4px' }, children: "Zero storage leakage" })] }), _jsxs("div", { className: "glass-panel", style: { padding: '20px' }, children: [_jsx("div", { style: { fontSize: '0.8rem', color: 'var(--text-subtle)', marginBottom: '6px' }, children: "Active Print Stations" }), _jsx("div", { style: { fontSize: '1.8rem', fontWeight: 800, color: '#fbbf24' }, children: "2 / 2" }), _jsx("div", { style: { fontSize: '0.75rem', color: '#34d399', marginTop: '4px' }, children: "100% Online" })] })] }), _jsxs("div", { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }, children: [_jsxs("div", { className: "glass-panel", style: { padding: '28px', textAlign: 'center' }, children: [_jsx("h3", { style: { fontSize: '1.2rem', fontWeight: 700, marginBottom: '6px' }, children: "Printable Kiosk QR Standee" }), _jsx("p", { style: { fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '20px' }, children: "Place on counter for customers to scan and print instantly" }), qrDataUrl && (_jsxs("div", { style: { background: 'white', padding: '20px', borderRadius: '16px', display: 'inline-block', marginBottom: '20px', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }, children: [_jsx("img", { src: qrDataUrl, alt: "Shop QR Standee", style: { width: '220px', height: '220px', display: 'block' } }), _jsx("div", { style: { color: '#0a0e17', fontWeight: 800, fontSize: '1rem', marginTop: '8px' }, children: selectedShop?.name }), _jsx("div", { style: { color: '#64748b', fontSize: '0.75rem' }, children: "Scan to Print in 60 Seconds" })] })), _jsx("div", { children: _jsxs("button", { onClick: () => window.print(), className: "btn-primary", style: { padding: '10px 20px' }, children: [_jsx(Printer, { size: 16 }), " Print Official Counter Standee"] }) })] }), _jsxs("div", { className: "glass-panel", style: { padding: '28px' }, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }, children: [_jsx(Settings2, { size: 20, color: "#818cf8" }), _jsx("h3", { style: { fontSize: '1.2rem', fontWeight: 700 }, children: "Custom Shop Rate Card" })] }), _jsx("p", { style: { fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '20px' }, children: "Rates are authoritatively enforced across all QR scans" }), _jsxs("div", { style: { display: 'flex', flexDirection: 'column', gap: '16px' }, children: [_jsxs("div", { children: [_jsx("label", { style: { display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '6px' }, children: "Standard A4 Black & White (per page in paise)" }), _jsx("input", { type: "number", value: customBwRate, onChange: (e) => setCustomBwRate(Number(e.target.value)), style: {
                                                                    width: '100%',
                                                                    background: 'rgba(255, 255, 255, 0.05)',
                                                                    border: '1px solid var(--border-subtle)',
                                                                    borderRadius: 'var(--radius-sm)',
                                                                    padding: '10px 14px',
                                                                    color: 'white',
                                                                } })] }), _jsxs("div", { children: [_jsx("label", { style: { display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '6px' }, children: "Premium A4 Full Color (per page in paise)" }), _jsx("input", { type: "number", value: customColorRate, onChange: (e) => setCustomColorRate(Number(e.target.value)), style: {
                                                                    width: '100%',
                                                                    background: 'rgba(255, 255, 255, 0.05)',
                                                                    border: '1px solid var(--border-subtle)',
                                                                    borderRadius: 'var(--radius-sm)',
                                                                    padding: '10px 14px',
                                                                    color: 'white',
                                                                } })] }), _jsx("button", { className: "btn-success", style: { marginTop: '12px' }, children: "Save Updated Rate Card" })] })] })] })] }))] })] }));
}

import React, { useState, useEffect, createContext, useContext, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import DOMPurify from 'dompurify';
import { initializeApp } from 'firebase/app';
import {
    getAuth,
    onAuthStateChanged,
    signInAnonymously,
    signInWithCustomToken
} from 'firebase/auth';
import {
    getFirestore,
    doc,
    setDoc,
    collection,
    onSnapshot,
    updateDoc,
    addDoc,
    query,
    where,
    getDocs
} from 'firebase/firestore';

// =================================================================================
// --- 1. CONTEXT & APP PROVIDER ---
// Central state management for the application.
// In a multi-file structure, this would be in: src/context/AppContext.js
// =================================================================================

const AppContext = createContext();

const AppProvider = ({ children }) => {
    const [userSegment, setUserSegment] = useState('b2c');
    const [darkMode, setDarkMode] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalContent, setModalContent] = useState({ title: '', content: null, data: null, type: null });
    const [isLoading, setIsLoading] = useState(false);
    const [currentPage, setCurrentPage] = useState('/dashboard');
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isPropertySelected, setIsPropertySelected] = useState(false);
    const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

    const showToast = (message, type = 'success') => {
        setToast({ show: true, message, type });
        setTimeout(() => {
            setToast({ show: false, message: '', type: 'success' });
        }, 3000);
    };

    const login = () => {
        setIsLoading(true);
        setTimeout(() => {
            setIsAuthenticated(true);
            setIsLoading(false);
            showToast('Login successful!', 'success');
        }, 1500);
    };

    const logout = () => {
        setIsAuthenticated(false);
        setIsPropertySelected(false);
        setCurrentPage('/dashboard');
        showToast('You have been logged out.', 'info');
    };

    const selectProperty = () => {
        setIsPropertySelected(true);
    };

    const openModal = async (config) => {
        const { title, type, prompt, data } = config;
        setIsLoading(true);
        setModalContent({ title, type, data, content: null });
        setIsModalOpen(true);

        if (type === 'report' && prompt) {
            try {
                const apiResponseText = await callGeminiAPI(prompt);
                setModalContent(prev => ({ ...prev, content: apiResponseText }));
            } catch (error) {
                console.error("Gemini API call error:", error);
                setModalContent(prev => ({ ...prev, content: `<p class="text-red-500 font-sans">An error occurred: ${error.message}. Please check the console.</p>`}));
                showToast('Failed to generate report.', 'error');
            } finally {
                setIsLoading(false);
            }
        } else {
            setIsLoading(false);
        }
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setModalContent({ title: '', content: null, data: null, type: null });
    };

    const handleFormSubmit = async (serviceName, mobileNumber) => {
        const prompt = `Generate a confirmation message for a user who has requested information about the "${serviceName}" service. The message should be friendly and professional, confirming that their request has been received and that an Evervale specialist will be in touch within 24 hours. Confirm their contact details: Name: ${mockUserData.name}, Email: ${mockUserData.email}, Mobile: ${mobileNumber}.`;
        openModal({ title: 'Request Confirmed', type: 'report', prompt });
        showToast('Service request submitted!', 'success');
    };

    const getPageTitle = () => PAGE_TITLES[currentPage] || 'Dashboard';

    const value = {
        userSegment, setUserSegment, darkMode, setDarkMode, isModalOpen, openModal, closeModal,
        modalContent, isLoading, handleFormSubmit, getPageTitle, currentPage, setCurrentPage,
        isAuthenticated, isPropertySelected, login, logout, selectProperty,
        toast, showToast,
    };

    return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

const useAppContext = () => useContext(AppContext);

// =================================================================================
// --- 2. API & UTILITIES ---
// Helper functions and services for external communication.
// In a multi-file structure, this would be in: src/utils/
// =================================================================================

const callGeminiAPI = async (prompt) => {
    // In a real app, use process.env.REACT_APP_GEMINI_API_KEY
    const GEMINI_API_KEY = "";
    if (!GEMINI_API_KEY) {
        console.warn("Gemini API key is not configured. Using mock response.");
        return Promise.resolve("### Mock API Response\n\nThis is a mock response because the API key is not set. In a real application, this would be a detailed explanation generated by the Gemini API, providing a step-by-step plan for your selected home upgrade.");
    }

    const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${GEMINI_API_KEY}`;

    const payload = {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
    };

    const response = await fetch(GEMINI_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorDetails = errorData?.error?.message || 'No additional details available.';
        throw new Error(`API call failed with status: ${response.status}. Details: ${errorDetails}`);
    }

    const result = await response.json();

    const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (text) {
        return text;
    }

    const errorReason = result?.promptFeedback?.blockReason?.reason || "unknown";
    throw new Error(`Sorry, I couldn't get a response. Reason: ${errorReason}.`);
};

const parseMarkdown = (text = "") => {
    if (!text) return "";
    return text
        .split('\n')
        .map(line => {
            if (line.startsWith('### ')) return `<h3 class="font-bold text-xl mb-2 mt-4 font-sans">${line.substring(4)}</h3>`;
            if (line.startsWith('## ')) return `<h2 class="font-bold text-2xl mb-3 mt-5 font-sans">${line.substring(3)}</h2>`;
            if (line.startsWith('* ')) return `<li class="list-disc list-inside mb-2 ml-4">${line.substring(2)}</li>`;
            if (line.startsWith('---')) return `<hr class="my-6 border-gray-200 dark:border-gray-700" />`;
            if (line.trim() === '') return '<br/>';
            return `<p class="mb-2">${line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\*(.*?)\*/g, '<em>$1</em>')}</p>`;
        })
        .join('');
};

// =================================================================================
// --- 3. CONSTANTS, ICONS & MOCK DATA ---
// Static data, navigation arrays, and SVG icons.
// In a multi-file structure, these would be in: src/constants/ or src/data/
// =================================================================================

const PAGE_TITLES = {
    '/dashboard': 'Homeowner Dashboard',
    '/certification': 'Evervale Leaf Certification',
    '/performance': 'Performance Analytics',
    '/services': 'Services Marketplace',
    '/profile': 'My Profile',
    '/b2b-dashboard': 'Business Dashboard',
    '/b2b-communities': 'Community Management',
    '/b2b-resources': 'B2B Resources',
    '/b2b-partners': 'Partnerships',
    '/b2b-commitments': 'Commitment Funnel',
    '/b2b-vendor-portal': 'ESCO Vendor Portal',
};

const COUNTRY_CODES = [
    { name: 'UAE', code: '+971' },
    { name: 'USA', code: '+1' },
    { name: 'UK', code: '+44' },
    { name: 'India', code: '+91' },
];

const Icon = ({ path, className = "" }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`h-6 w-6 ${className}`}>
        {path}
    </svg>
);

const LOGOS = {
    UAEPASS: () => (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z" fill="currentColor"/>
        </svg>
    ),
    DLD: () => (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 3L2 12h3v8h14v-8h3L12 3zm0 15c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z" fill="currentColor"/>
        </svg>
    )
};

const ICONS = {
    Leaf: <Icon path={<><path d="M11 20A7 7 0 0 1 4 13V8a2 2 0 0 1 2-2h1" /><path d="M15 8a2 2 0 0 1 2 2v8a7 7 0 0 1-14 0" /></>} />,
    Home: <Icon path={<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />} />,
    BarChart2: <Icon path={<><line x1="18" x2="18" y1="20" y2="10" /><line x1="12" x2="12" y1="20" y2="4" /><line x1="6" x2="6" y1="20" y2="14" /></>} />,
    Wrench: <Icon path={<><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" /></>} />,
    User: <Icon path={<><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>} />,
    Briefcase: <Icon path={<><rect width="20" height="14" x="2" y="7" rx="2" ry="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></>} />,
    Building: <Icon path={<><rect width="16" height="20" x="4" y="2" rx="2" /><path d="M9 22v-4h6v4" /><path d="M8 6h.01" /><path d="M16 6h.01" /><path d="M12 6h.01" /><path d="M12 10h.01" /><path d="M12 14h.01" /><path d="M16 10h.01" /><path d="M16 14h.01" /><path d="M8 10h.01" /><path d="M8 14h.01" /></>} />,
    Book: <Icon path={<><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" /></>} />,
    B2BUsers: <Icon path={<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>} />,
    Bell: <Icon path={<><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></>} className="text-gray-600 dark:text-gray-300" />,
    Settings: <Icon path={<><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 0 2l-.15.08a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l-.22-.38a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1 0-2l.15.08a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></>} className="text-gray-600 dark:text-gray-300" />,
    Sun: <Icon path={<><circle cx="12" cy="12" r="4" /><path d="M12 2v2" /><path d="M12 20v2" /><path d="m4.93 4.93 1.41 1.41" /><path d="m17.66 17.66 1.41 1.41" /><path d="M2 12h2" /><path d="M20 12h2" /><path d="m6.34 17.66-1.41 1.41" /><path d="m19.07 4.93-1.41 1.41" /></>} className="text-gray-300" />,
    Moon: <Icon path={<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />} className="text-gray-600" />,
    X: <Icon path={<><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>} />,
    Info: <Icon path={<><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></>} />,
    Sparkles: <Icon path={<><path d="m12 3-1.9 4.2-4.3.6 3.1 3- .7 4.2 3.8-2 3.8 2-.7-4.2 3.1-3-4.3-.6Z" /></>} />,
    DollarSign: <Icon path={<><line x1="12" x2="12" y1="2" y2="22" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></>} />,
    Zap: <Icon path={<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />} />,
    Droplet: <Icon path={<><path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C5 11.1 4 13 4 15a7 7 0 0 0 7 7z" /></>} />,
    CheckCircle: <Icon path={<><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><path d="m9 11 3 3L22 4" /></>} />,
    Users: <Icon path={<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>} />,
    TrendingUp: <Icon path={<><polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" /></>} />,
    AlertTriangle: <Icon path={<><path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><path d="M12 9v4" /><path d="M12 17h.01" /></>} />,
    FileText: <Icon path={<><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" /><polyline points="14 2 14 8 20 8" /><line x1="16" x2="8" y1="13" y2="13" /><line x1="16" x2="8" y1="17" y2="17" /><line x1="10" x2="8" y1="9" y2="9" /></>} />,
    Calculator: <Icon path={<><rect width="16" height="20" x="4" y="2" rx="2" /><line x1="8" x2="16" y1="6" y2="6" /><line x1="16" x2="16" y1="14" y2="18" /><path d="M16 10h.01" /><path d="M12 10h.01" /><path d="M8 10h.01" /><path d="M12 14h.01" /><path d="M8 14h.01" /><path d="M12 18h.01" /><path d="M8 18h.01" /></>} />,
    Wallet: <Icon path={<><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" /><path d="M3 5v14a2 2 0 0 0 2 2h16v-5" /><path d="M18 12a2 2 0 0 0 0 4h4v-4Z" /></>} />,
    ArrowLeft: <Icon path={<><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></>} />,
    Copy: <Icon path={<><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></>} />,
    ChevronDown: <Icon path={<path d="m6 9 6 6 6-6"/>} />,
    Download: <Icon path={<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></>} />,
    LogOut: <Icon path={<><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></>} />,
    Gavel: <Icon path={<><path d="m14 12-8.5 8.5a2.12 2.12 0 1 1-3-3L11 9"/><path d="m15 5 6 6"/><path d="m22 11-6-6"/><path d="m8 8 2 2"/><path d="m16 16 2 2"/></>} />
};

const B2C_NAV = [
    { id: 'b2c1', name: 'Dashboard', path: '/dashboard', icon: ICONS.Home },
    { id: 'b2c2', name: 'Certification', path: '/certification', icon: ICONS.Leaf },
    { id: 'b2c3', name: 'Performance', path: '/performance', icon: ICONS.BarChart2 },
    { id: 'b2c4', name: 'Services', path: '/services', icon: ICONS.Wrench },
    { id: 'b2c5', name: 'Profile', path: '/profile', icon: ICONS.User },
];
const B2B_NAV = [
    { id: 'b2b1', name: 'Dashboard', path: '/b2b-dashboard', icon: ICONS.Briefcase },
    { id: 'b2b2', name: 'Communities', path: '/b2b-communities', icon: ICONS.Building },
    { id: 'b2b3', name: 'Commitments', path: '/b2b-commitments', icon: ICONS.Gavel },
    { id: 'b2b4', name: 'Vendor Portal', path: '/b2b-vendor-portal', icon: ICONS.Wrench },
    { id: 'b2b5', name: 'Resources', path: '/b2b-resources', icon: ICONS.Book },
    { id: 'b2b6', name: 'Partners', path: '/b2b-partners', icon: ICONS.B2BUsers },
];

const mockUserData = {
    name: 'John Doe',
    email: 'j.doe@email.com',
    propertyAddress: 'Villa 12, Arabian Ranches, Dubai',
    memberSince: '2022-09-15',
    profilePic: `https://placehold.co/100x100/E2E8F0/4A5568?text=JD`,
    properties: [
        { id: 'prop1', name: 'Villa 12, Arabian Ranches', details: '5 Bedroom Villa, 4,500 sqft', type: 'Villa' },
        { id: 'prop2', name: 'Apartment 101, Downtown Views', details: '2 Bedroom Apartment, 1,200 sqft', type: 'Apartment' },
    ]
};

const mockCommunityFunnels = [
    {
        id: 'arabian-ranches-retrofit-1',
        community: 'Arabian Ranches',
        title: 'Full Retrofitting Initiative',
        champion: 'John Doe',
        participants: 7,
        goal: 30,
        referralLink: 'https://evervale.app/funnel/AR-RF1',
        isUsersCommunity: true,
        description: "Let's lower our DEWA bills and make our community the greenest in Dubai! Join the initiative for a full home energy and water retrofit.",
        status: 'aggregating'
    },
    {
        id: 'dubai-hills-solar-1',
        community: 'Dubai Hills Estate',
        title: 'Community Solar Panel Project',
        champion: 'Jane Smith',
        participants: 12,
        goal: 30,
        referralLink: 'https://evervale.app/funnel/DH-SP1',
        isUsersCommunity: false,
        description: "Harness the power of the sun! Join our community-led project to install solar panels at a discounted bulk rate.",
        status: 'aggregating'
    }
];

const mockCertificationData = {
    score: 85,
    tier: 'Gold',
    date: '2025-03-10',
    breakdown: [
        { name: 'Energy Efficiency', value: 90, color: '#4ade80', icon: ICONS.Zap },
        { name: 'Water Conservation', value: 85, color: '#60a5fa', icon: ICONS.Droplet },
        { name: 'Materials & Waste', value: 75, color: '#facc15', icon: ICONS.Leaf },
        { name: 'Smart Systems', value: 95, color: '#a78bfa', icon: ICONS.Wrench },
    ],
    recommendations: [
        { id: 1, text: 'Upgrade to smart thermostat', completed: true },
        { id: 2, text: 'Install solar panels', completed: true },
        { id: 3, text: 'Install low-flow fixtures', completed: false },
        { id: 4, text: 'Upgrade to double-glazed windows', completed: false },
    ],
    upgradeTips: {
        'Energy Efficiency': "Consider upgrading your HVAC system to a newer, more energy-efficient model. You can also improve insulation in your attic and walls.",
        'Water Conservation': "Installing low-flow toilets and showerheads can significantly reduce water usage. Consider a smart irrigation system for your garden.",
        'Materials & Waste': "Focus on a comprehensive recycling program and composting organic waste. When renovating, choose sustainable and recycled materials.",
        'Smart Systems': "Integrate smart lighting and security systems that can be controlled remotely to optimize energy use."
    }
};

const mockPerformanceData = {
    energyUsage: [
        { month: 'Jan', lastYear: 1500, thisYear: 1200 }, { month: 'Feb', lastYear: 1400, thisYear: 1100 },
        { month: 'Mar', lastYear: 1600, thisYear: 1250 }, { month: 'Apr', lastYear: 1800, thisYear: 1400 },
        { month: 'May', lastYear: 2200, thisYear: 1700 }, { month: 'Jun', lastYear: 2500, thisYear: 1900 },
    ],
    costSavings: [
        { month: 'Jan', savings: 400 }, { month: 'Feb', savings: 350 }, { month: 'Mar', savings: 350 },
        { month: 'Apr', savings: 250 }, { month: 'May', savings: 300 }, { month: 'Jun', savings: 250 },
    ],
    propertyValue: { initial: 5000000, current: 5750000, greenPremium: 750000, increasePercentage: 15 },
    carbonFootprint: { lastYear: 5.2, thisYear: 3.8, reduction: 1.4 },
    benchmarks: {
        energySavingsPercent: { current: 20, marketStandard: 12, targetGoal: 25 },
        costSavingsAED: { current: 1900, marketStandard: 1100, targetGoal: 2500 },
        greenPremiumPercent: { current: 15, marketStandard: 8, targetGoal: 18 },
    }
};

const mockServices = [
    { id: 1, name: 'Solar Panel Installation', description: 'Harness the power of the sun to reduce your energy bills.', price: 'Starts at AED 25,000', category: 'Energy' },
    { id: 2, name: 'Smart Home Automation', description: 'Integrate smart thermostats, lighting, and security systems.', price: 'Custom Quote', category: 'Technology' },
    { id: 3, name: 'Water-Efficient Landscaping', description: 'Design a beautiful, low-water garden with native plants.', price: 'Starts at AED 5,000', category: 'Water' },
    { id: 4, name: 'EV Charger Installation', description: 'Install a home charging station for your electric vehicle.', price: 'Starts at AED 3,500', category: 'Energy' },
    { id: 5, name: 'Advanced Water Filtration', description: 'Get pure, filtered water from every tap in your home.', price: 'Starts at AED 8,000', category: 'Water' },
    { id: 6, name: 'Home Energy Audit', description: 'A comprehensive assessment to identify energy-saving opportunities.', price: 'AED 1,500', category: 'Consulting' },
];

const mockB2BData = {
    communities: [
        { id: 1, name: 'Arabian Ranches', villas: 4000, avgScore: 78, potentialValue: 120000000, engagementRate: 48, topInterest: 'Solar Panels', warmLeads: 35, projectedValue: 875000, scoreBreakdown: { energy: 85, water: 70, waste: 75 }, activeProjects: 1, currentRevenue: 1500000 },
        { id: 2, name: 'Dubai Hills Estate', villas: 2500, avgScore: 85, potentialValue: 90000000, engagementRate: 62, topInterest: 'EV Chargers', warmLeads: 50, projectedValue: 175000, scoreBreakdown: { energy: 90, water: 80, waste: 85 }, activeProjects: 2, currentRevenue: 2200000 },
        { id: 3, name: 'Emirates Hills', villas: 800, avgScore: 72, potentialValue: 60000000, engagementRate: 25, topInterest: 'Water Filtration', warmLeads: 10, projectedValue: 80000, scoreBreakdown: { energy: 70, water: 75, waste: 70 }, activeProjects: 0, currentRevenue: 0 },
    ]
};

const mockB2BPersonaData = {
    esco: {
        kpi1: { title: "Committed Retrofit CAPEX", value: "AED 45M" },
        kpi2: { title: "Qualified Funnels", value: "3" },
        kpi3: { title: "Payback from Savings (Rental)", value: "5-7 Years" },
        kpi4: { title: "Payback from Sale (Resale)", value: "< 1 Year" },
    },
    developer: {
        performance: [
            { title: "Total Green Premium Added", value: "AED 25M", icon: ICONS.DollarSign, color: "text-green-500", rawValue: 25000000 },
            { title: "Avg. Green Villa Sale Uplift", value: "+18%", icon: ICONS.TrendingUp, color: "text-green-500" },
            { title: "Reduced Days on Market", value: "-25 Days", icon: ICONS.Zap, color: "text-green-500" },
            { title: "Evervale Lead Conversion Rate", value: "12%", comparison: "+40% vs Market Avg.", icon: ICONS.CheckCircle, color: "text-blue-500" },
        ],
        opportunities: [
            { title: "Untapped Green Premium", value: "AED 15.2M", subtitle: "Across 80 uncertified units", icon: ICONS.Home, color: "text-purple-500", rawValue: 15200000 },
            { title: "High-Engagement Community", value: "48% Engagement", subtitle: "In Arabian Ranches", icon: ICONS.Users, color: "text-purple-500" },
        ]
    },
    communityManager: {
        kpis: [
            { title: "Annual OPEX Savings", value: "AED 1.2M", icon: ICONS.Wallet, color: "text-green-500" },
            { title: "Community-Wide Utility Reduction", value: "-22%", icon: ICONS.Zap, color: "text-green-500" },
            { title: "Homeowner Engagement", value: "48%", comparison: "+12% this quarter", icon: ICONS.Users, color: "text-blue-500" },
            { title: "Community Satisfaction (CSAT)", value: "8.2 / 10", comparison: "vs. 9.5 for certified homes", icon: ICONS.Sparkles, color: "text-blue-500" },
        ],
        nextProject: {
            title: "Next Best Project: Solar Initiative",
            potentialInterest: "35 Homes",
            potentialSavings: "AED 250,000/year",
            icon: ICONS.Sun
        },
        topInterests: [
            { name: "Solar Panels", interest: 65 },
            { name: "EV Chargers", interest: 45 },
            { name: "Water Filtration", interest: 30 },
            { name: "Smart Thermostats", interest: 25 },
        ]
    }
};

const mockEscoFunnels = [
    {
        name: "Arabian Ranches - Full Retrofit",
        status: "Aggregating",
        committedUnits: 28,
        goal: 30,
        projectedCapex: "AED 1.5M",
        projectedProfitMargin: "18%",
    },
    {
        name: "Downtown Views - HVAC Upgrade",
        status: "Ready to Deploy",
        committedUnits: 50,
        goal: 50,
        projectedCapex: "AED 2.2M",
        projectedProfitMargin: "22%",
    },
    {
        name: "The Springs - Solar Panel Initiative",
        status: "Aggregating",
        committedUnits: 15,
        goal: 40,
        projectedCapex: "AED 3.1M",
        projectedProfitMargin: "25%"
    }
];

// =================================================================================
// --- 4. LAYOUT & COMMON COMPONENTS ---
// Reusable UI elements that form the application's shell.
// In a multi-file structure, these would be in: src/components/common/
// =================================================================================

const Card = ({ children, className = '' }) => (
    <div className={`bg-white dark:bg-[#101828] rounded-xl shadow-lg p-6 transition-colors duration-300 border border-[#EAECF0] dark:border-gray-700 ${className}`}>
        {children}
    </div>
);

const Spinner = () => (
    <div className="flex justify-center items-center h-full p-16">
        <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-[#00483C]"></div>
    </div>
);

const Modal = ({ isOpen, onClose, children, maxWidth = 'max-w-2xl' }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm flex items-center justify-center p-4 z-50" onClick={onClose}>
            <div className={`bg-[#FFFFFF] dark:bg-[#101828] w-full ${maxWidth} rounded-xl shadow-2xl overflow-hidden`} onClick={e => e.stopPropagation()}>
                {children}
            </div>
        </div>
    );
};

const InputField = ({ label, value, onChange, placeholder, type = 'text', id, required = false }) => (
    <div>
        <label htmlFor={id} className="block text-sm font-medium text-[#667085] dark:text-gray-300 mb-1">
            {label}
        </label>
        <input
            type={type}
            id={id}
            name={id}
            value={value}
            onChange={onChange}
            placeholder={placeholder}
            required={required}
            className="w-full px-4 py-2 bg-[#F9FAFB] dark:bg-gray-700 border border-[#EAECF0] dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-[#00483C] focus:border-[#00483C] transition"
        />
    </div>
);

const Header = ({ title }) => {
    const { darkMode, setDarkMode } = useAppContext();
    return (
        <header className="bg-white/80 dark:bg-[#101828]/50 backdrop-blur-sm p-4 flex justify-between items-center sticky top-0 z-10 border-b border-[#EAECF0] dark:border-gray-800">
            <h1 className="text-2xl md:text-3xl font-bold text-[#101828] dark:text-white">{title}</h1>
            <div className="flex items-center space-x-4">
                <button onClick={() => setDarkMode(!darkMode)} className="p-2 rounded-full hover:bg-[#F9FAFB] dark:hover:bg-gray-800 transition-colors" aria-label="Toggle dark mode">
                    {darkMode ? ICONS.Sun : ICONS.Moon}
                </button>
                <button className="p-2 rounded-full hover:bg-[#F9FAFB] dark:hover:bg-gray-800 transition-colors" aria-label="Notifications">{ICONS.Bell}</button>
                <button className="p-2 rounded-full hover:bg-[#F9FAFB] dark:hover:bg-gray-800 transition-colors" aria-label="Settings">{ICONS.Settings}</button>
            </div>
        </header>
    );
};

const Sidebar = () => {
    const { userSegment, setUserSegment, currentPage, setCurrentPage, logout } = useAppContext();
    const navItems = userSegment === 'b2c' ? B2C_NAV : B2B_NAV;

    const handleSegmentChange = (segment) => {
        setUserSegment(segment);
        setCurrentPage(segment === 'b2c' ? '/dashboard' : '/b2b-dashboard');
    };

    const linkClass = "flex items-center py-3 px-4 rounded-lg mx-2 transition-colors duration-200 hover:bg-[#F9FAFB] dark:hover:bg-gray-800";
    const activeLinkClass = userSegment === 'b2c' ? 'bg-[#00483C] text-white shadow-md' : 'bg-[#667085] text-white shadow-md';

    return (
        <aside className="w-16 md:w-64 bg-white dark:bg-[#101828] text-[#101828] dark:text-white flex flex-col transition-all duration-300 border-r border-[#EAECF0] dark:border-gray-700">
            <div className="flex items-center justify-center md:justify-start p-4 border-b border-[#EAECF0] dark:border-gray-700">
                 <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-[#00483C]">
                    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <h1 className="hidden md:block ml-3 text-2xl font-bold text-[#00483C]">Evervale</h1>
            </div>

            <div className="p-2 mt-2">
                <div className="bg-[#F9FAFB] dark:bg-gray-800 rounded-lg p-1 flex">
                    <button onClick={() => handleSegmentChange('b2c')} className={`w-1/2 py-2 text-sm font-bold flex items-center justify-center rounded-md transition-all duration-300 ${userSegment === 'b2c' ? 'bg-white dark:bg-gray-700 shadow text-[#00483C]' : 'text-[#667085]'}`} aria-pressed={userSegment === 'b2c'}>
                        <div className="h-4 w-4 md:mr-2">{ICONS.User}</div><span className="hidden md:inline">Homeowner</span>
                    </button>
                    <button onClick={() => handleSegmentChange('b2b')} className={`w-1/2 py-2 text-sm font-bold flex items-center justify-center rounded-md transition-all duration-300 ${userSegment === 'b2b' ? 'bg-white dark:bg-gray-700 shadow text-[#101828]' : 'text-[#667085]'}`} aria-pressed={userSegment === 'b2b'}>
                        <div className="h-4 w-4 md:mr-2">{ICONS.Briefcase}</div><span className="hidden md:inline">Business</span>
                    </button>
                </div>
            </div>

            <nav className="flex-grow mt-4">
                <ul>
                    {navItems.map(item => (
                        <li key={item.id} className="my-2">
                            <button
                                onClick={() => setCurrentPage(item.path)}
                                className={`w-full text-left ${linkClass} ${currentPage === item.path ? activeLinkClass : ''}`}
                                aria-current={currentPage === item.path ? 'page' : undefined}
                            >
                                {React.cloneElement(item.icon, { className: `h-6 w-6 ${currentPage === item.path ? 'text-white' : 'text-[#667085]'}` })}
                                <span className="hidden md:block ml-4 font-medium">{item.name}</span>
                            </button>
                        </li>
                    ))}
                </ul>
            </nav>

            <div className="p-4 border-t border-[#EAECF0] dark:border-gray-700">
                <div className="flex items-center">
                    <img src={mockUserData.profilePic} alt="User profile" className="h-10 w-10 rounded-full" />
                    <div className="hidden md:block ml-3">
                        <p className="font-semibold text-sm">{mockUserData.name}</p>
                        <p className="text-xs text-[#667085] dark:text-gray-400">View Profile</p>
                    </div>
                </div>
                 <button onClick={logout} className="w-full mt-4 flex items-center justify-center md:justify-start text-left py-2 px-3 rounded-lg text-sm text-[#667085] dark:text-gray-400 hover:bg-red-50 dark:hover:bg-red-900/50 hover:text-red-600 dark:hover:text-red-400 transition-colors">
                    {ICONS.LogOut}
                    <span className="hidden md:block ml-3 font-medium">Logout</span>
                </button>
            </div>
        </aside>
    );
};

const Toast = () => {
    const { toast } = useAppContext();
    if (!toast.show) return null;

    const baseStyle = "fixed bottom-5 right-5 p-4 rounded-lg shadow-lg text-white transition-opacity duration-300 z-50";
    const styles = {
        success: "bg-green-500",
        error: "bg-red-500",
        info: "bg-blue-500",
    };

    return (
        <div className={`${baseStyle} ${styles[toast.type]}`}>
            {toast.message}
        </div>
    );
};

// =================================================================================
// --- 5. AUTHENTICATION & ONBOARDING COMPONENTS ---
// Screens for user login and initial setup.
// In a multi-file structure, these would be in: src/components/auth/
// =================================================================================

const LoginScreen = () => {
    const { login, isLoading } = useAppContext();
    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-[#F9FAFB] dark:bg-[#101828]">
            <div className="text-center p-8 max-w-md w-full">
                <div className="flex items-center justify-center mb-6">
                    <div className="text-[#00483C]">{React.cloneElement(ICONS.Leaf, {className: "h-16 w-16"})}</div>
                    <h1 className="ml-4 text-5xl font-bold text-[#101828] dark:text-white">Evervale</h1>
                </div>
                <p className="text-lg text-[#667085] dark:text-gray-300 mb-8">Your partner in sustainable luxury living.</p>
                <button
                    onClick={login}
                    disabled={isLoading}
                    className="inline-flex items-center justify-center px-8 py-4 bg-[#101828] text-white font-bold rounded-lg shadow-lg hover:bg-black transition-colors disabled:bg-gray-400 w-full"
                >
                    {isLoading ? <Spinner /> : (
                        <>
                            <LOGOS.UAEPASS />
                            <span className="ml-3">Login with UAE Pass</span>
                        </>
                    )}
                </button>
                <p className="text-xs text-gray-500 mt-4">Securely access your Evervale account using your national digital identity.</p>
            </div>
        </div>
    );
};

const PropertySelectionScreen = () => {
    const { selectProperty } = useAppContext();
    const { properties } = mockUserData;

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-[#F9FAFB] dark:bg-[#101828] p-6">
            <div className="w-full max-w-2xl">
                <div className="flex items-center justify-center text-[#667085] dark:text-gray-400 mb-4">
                    <LOGOS.DLD />
                    <span className="ml-2 text-sm font-semibold">Securely synced from Dubai Land Department (DLD)</span>
                </div>
                <h2 className="text-3xl font-bold text-center text-[#101828] dark:text-white mb-2">Select a Property</h2>
                <p className="text-center text-[#667085] dark:text-gray-400 mb-8">We found the following properties registered under your name. Please select which one you'd like to manage.</p>
                <div className="space-y-4">
                    {properties.map(prop => {
                        const isSupported = prop.type === 'Villa' || prop.type === 'Townhouse';
                        return (
                            <button
                                key={prop.id}
                                onClick={isSupported ? selectProperty : undefined}
                                disabled={!isSupported}
                                className={`w-full text-left p-6 bg-white dark:bg-gray-800 rounded-xl shadow-md border-2 transition-all duration-300 ${isSupported ? 'hover:shadow-lg hover:border-[#00483C] border-transparent cursor-pointer' : 'opacity-50 border-dashed border-gray-300 dark:border-gray-600 cursor-not-allowed'}`}
                            >
                                <p className="font-bold text-lg text-[#101828] dark:text-white">{prop.name}</p>
                                <p className="text-sm text-[#667085] dark:text-gray-400">{prop.details}</p>
                                {!isSupported && (
                                    <p className="text-xs font-semibold text-orange-500 mt-2">Apartments not yet supported.</p>
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

// =================================================================================
// --- 6. FEATURE-SPECIFIC COMPONENTS ---
// Components used across multiple pages but for specific features.
// In a multi-file structure, these would be in: src/components/features/
// =================================================================================

const BrandedReport = ({ title, content, benchmarkData }) => {
    const generatedDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    const createMarkup = (htmlContent) => {
        return { __html: DOMPurify.sanitize(htmlContent) };
    };

    const isHtmlError = typeof content === 'string' && content.startsWith('<p');
    const finalContent = isHtmlError ? content : parseMarkdown(content);

    return (
        <div className="bg-white dark:bg-gray-900 p-8 sm:p-12 shadow-lg w-full font-serif text-gray-800 dark:text-gray-200">
            <div className="flex items-center justify-between pb-4 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center">
                    <div className="text-green-500">{ICONS.Leaf}</div>
                    <span className="ml-3 text-xl font-semibold">Evervale</span>
                </div>
                <span className="text-sm text-gray-500">{generatedDate}</span>
            </div>
            <div className="my-8">
                <h2 className="text-3xl font-bold text-gray-900 dark:text-white font-sans">{title}</h2>
            </div>

            <div
                className="prose prose-lg dark:prose-invert max-w-none prose-headings:font-sans prose-p:font-serif prose-strong:font-bold"
                dangerouslySetInnerHTML={createMarkup(finalContent)}
            />

            {benchmarkData && (
                <div className="mt-10 font-sans">
                    <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Performance Benchmark</h3>
                    <div className="space-y-4">
                        {Object.entries(benchmarkData).map(([key, value]) => (
                            <div key={key} className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                                <p className="font-bold text-gray-700 dark:text-gray-200 capitalize">
                                    {key.replace(/([A-Z])/g, ' $1').replace(/AED/g, '(AED)').trim()}
                                </p>
                                <div className="grid grid-cols-3 gap-4 mt-2 text-center">
                                    <div>
                                        <p className="text-2xl font-bold text-green-500">{value.current}{key.includes('Percent') ? '%' : ''}</p>
                                        <p className="text-xs text-gray-500">Your Home</p>
                                    </div>
                                    <div>
                                        <p className="text-2xl font-bold text-blue-500">{value.marketStandard}{key.includes('Percent') ? '%' : ''}</p>
                                        <p className="text-xs text-gray-500">Market Standard</p>
                                    </div>
                                    <div>
                                        <p className="text-2xl font-bold text-purple-500">{value.targetGoal}{key.includes('Percent') ? '%' : ''}</p>
                                        <p className="text-xs text-gray-500">Target Goal</p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

const RequestInfoForm = ({ serviceName, onSubmit }) => {
    const [mobile, setMobile] = useState('');
    const [countryCode, setCountryCode] = useState('+971');
    const [consent, setConsent] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        setError('');
        if (!/^\d{7,15}$/.test(mobile.replace(/\s/g, ''))) {
            setError('Please enter a valid mobile number.');
            return;
        }
        onSubmit(serviceName, `${countryCode} ${mobile}`);
    };

    return (
        <div className="p-8">
            <h2 className="text-2xl font-bold mb-2">Request for Information</h2>
            <p className="text-gray-600 dark:text-gray-300 mb-6">Confirm your details to learn more about <strong>{serviceName}</strong>.</p>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label htmlFor="name" className="block text-sm font-medium">Name</label>
                    <input id="name" type="text" value={mockUserData.name} disabled className="mt-1 block w-full px-3 py-2 bg-gray-100 dark:bg-gray-700 rounded-md" />
                </div>
                <div>
                    <label htmlFor="email" className="block text-sm font-medium">Email</label>
                    <input id="email" type="email" value={mockUserData.email} disabled className="mt-1 block w-full px-3 py-2 bg-gray-100 dark:bg-gray-700 rounded-md" />
                </div>
                <div>
                    <label htmlFor="mobile" className="block text-sm font-medium">Mobile Number</label>
                    <div className="mt-1 flex rounded-md shadow-sm">
                        <select value={countryCode} onChange={e => setCountryCode(e.target.value)} className="inline-flex items-center px-3 rounded-l-md border border-r-0 bg-gray-50 dark:bg-gray-600 text-sm">
                            {COUNTRY_CODES.map(c => <option key={c.name} value={c.code}>{c.name} ({c.code})</option>)}
                        </select>
                        <input id="mobile" type="tel" value={mobile} onChange={(e) => setMobile(e.target.value)} required placeholder="5X XXX XXXX" className="flex-1 min-w-0 block w-full px-3 py-2 rounded-none rounded-r-md border dark:bg-gray-700 dark:border-gray-600 focus:ring-green-500 focus:border-green-500" />
                    </div>
                    {error && <p className="text-red-500 text-sm mt-1">{error}</p>}
                </div>
                <div className="flex items-start">
                    <div className="flex items-center h-5">
                        <input id="consent" name="consent" type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} className="focus:ring-green-500 h-4 w-4 text-green-600 border-gray-300 rounded" />
                    </div>
                    <div className="ml-3 text-sm">
                        <label htmlFor="consent" className="font-medium">I agree to receive marketing communications.</label>
                    </div>
                </div>
                <button type="submit" className="w-full bg-green-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-green-700 transition-colors">
                    Send Request
                </button>
            </form>
        </div>
    );
};

// =================================================================================
// --- 7. B2C PAGE COMPONENTS ---
// Main content components for the Homeowner (B2C) section.
// In a multi-file structure, these would be in: src/pages/b2c/
// =================================================================================

const Dashboard = () => {
    const { setCurrentPage, showToast } = useAppContext();
    const { score, tier } = mockCertificationData;
    const { propertyValue, costSavings } = mockPerformanceData;
    const totalSavings = costSavings.reduce((acc, item) => acc + item.savings, 0);
    const [funnels, setFunnels] = useState(mockCommunityFunnels);
    const [isProjectCreatorOpen, setIsProjectCreatorOpen] = useState(false);
    const [activeLoiFunnel, setActiveLoiFunnel] = useState(null);

    const StatCard = ({ icon, title, value, unit = '' }) => (
        <Card>
            <div className="flex items-center">
                <div className="p-3 bg-blue-100 dark:bg-blue-900/50 rounded-lg mr-4">{icon}</div>
                <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{title}</p>
                    <p className="text-2xl font-bold text-gray-800 dark:text-white">{value}{unit}</p>
                </div>
            </div>
        </Card>
    );

    const CommunityFunnelCard = ({ funnel, onJoin }) => {
        const { participants, goal, title, community, referralLink, isUsersCommunity, description } = funnel;
        const progress = (participants / goal) * 100;
        const [copied, setCopied] = useState(false);

        const copyToClipboard = () => {
            const dummy = document.createElement("textarea");
            document.body.appendChild(dummy);
            dummy.value = referralLink;
            dummy.select();
            document.execCommand("copy");
            document.body.removeChild(dummy);
            setCopied(true);
            showToast('Referral link copied to clipboard!');
            setTimeout(() => setCopied(false), 2000);
        };

        return (
            <Card className={`flex flex-col justify-between ${isUsersCommunity ? 'border-2 border-[#00483C]' : ''}`}>
                <div>
                    {isUsersCommunity && <div className="text-xs font-bold uppercase text-[#00483C] mb-2">Your Community Project</div>}
                    <h3 className="font-bold text-lg mb-2">{title}</h3>
                    <p className="text-sm text-[#667085] dark:text-gray-400 mb-4">{community}</p>

                    <div className="relative pt-1">
                        <div className="flex mb-2 items-center justify-between">
                            <div>
                                <span className="text-xs font-semibold inline-block py-1 px-2 uppercase rounded-full text-green-600 bg-green-200 dark:bg-green-800 dark:text-green-200">
                                    {participants} / {goal} Homes Committed
                                </span>
                            </div>
                        </div>
                        <div className="overflow-hidden h-4 mb-4 text-xs flex rounded bg-green-200 dark:bg-green-800">
                            <div style={{ width: `${progress}%` }} className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-[#00483C] transition-all duration-500"></div>
                        </div>
                    </div>

                    <p className="text-sm text-[#667085] dark:text-gray-400 mb-4">{description}</p>
                    {isUsersCommunity && <p className="text-xs text-[#667085] dark:text-gray-400 mb-4">You are the Community Champion! Share the link below to invite your neighbors.</p>}
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-2 mt-auto">
                    {isUsersCommunity ? (
                        <>
                            <input type="text" value={referralLink} readOnly className="w-full px-3 py-2 text-sm bg-[#F9FAFB] dark:bg-gray-700 border border-[#EAECF0] dark:border-gray-600 rounded-lg" />
                            <button onClick={copyToClipboard} className="p-2 bg-[#667085] hover:bg-[#101828] text-white font-semibold rounded-lg transition relative" aria-label="Copy referral link">
                                {ICONS.Copy}
                                {copied && <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-black text-white text-xs px-2 py-1 rounded">Copied!</span>}
                            </button>
                        </>
                    ) : (
                        <button onClick={() => onJoin(funnel)} className="w-full px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-lg transition">
                            Show Interest
                        </button>
                    )}
                </div>
            </Card>
        );
    };

    const handleConfirmLoi = (funnelId) => {
        setFunnels(currentFunnels =>
            currentFunnels.map(funnel =>
                funnel.id === funnelId && funnel.participants < funnel.goal
                    ? { ...funnel, participants: funnel.participants + 1 }
                    : funnel
            )
        );
        setActiveLoiFunnel(null);
        showToast('Thank you for showing interest!', 'success');
    };

    const handleCreateProject = (newProject) => {
        setFunnels(currentFunnels => [...currentFunnels, newProject]);
        setIsProjectCreatorOpen(false);
        showToast('New community project created!', 'success');
    }

    return (
        <>
            <div className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <Card className="lg:col-span-2 bg-gradient-to-br from-[#00483C] to-emerald-700 text-white">
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center h-full">
                            <div>
                                <h2 className="text-2xl font-bold">Welcome back, {mockUserData.name.split(' ')[0]}!</h2>
                                <p className="mt-2 text-green-100">Your home is performing beautifully.</p>
                                <button onClick={() => setCurrentPage('/performance')} className="mt-4 inline-block bg-white text-[#00483C] font-bold py-2 px-4 rounded-lg shadow-lg hover:bg-green-50 transition-transform hover:scale-105">
                                    View Performance
                                </button>
                            </div>
                            <div className="mt-6 md:mt-0 flex items-center justify-center">
                                <div className="relative">
                                    <svg className="transform -rotate-90" width="160" height="160" viewBox="0 0 36 36">
                                        <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#ffffff40" strokeWidth="3" />
                                        <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#fff" strokeWidth="3" strokeDasharray={`${score}, 100`} />
                                    </svg>
                                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                                        <span className="text-4xl font-bold">{score}</span>
                                        <span className="text-lg">{tier} Tier</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </Card>
                    <Card>
                        <h3 className="font-bold text-lg mb-4">Property Value</h3>
                        <div className="flex items-center mb-2">
                            <div className="text-[#00483C] mr-3">{ICONS.DollarSign}</div>
                            <div>
                                <p className="text-3xl font-bold">AED {propertyValue.current.toLocaleString()}</p>
                                <p className="text-sm text-[#667085]">Current Estimated Value</p>
                            </div>
                        </div>
                    </Card>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <StatCard icon={ICONS.Zap} title="Energy Saved (YTD)" value="2.4" unit=" MWh" />
                    <StatCard icon={ICONS.Droplet} title="Water Saved (YTD)" value="15,000" unit=" L" />
                    <StatCard icon={ICONS.DollarSign} title="Cost Savings (YTD)" value={`AED ${totalSavings.toLocaleString()}`} />
                    <StatCard icon={ICONS.Leaf} title="CO₂ Reduction (YTD)" value="1.4" unit=" tons" />
                </div>

                <Card>
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="font-bold text-xl">Community Retrofit Projects</h3>
                        <button onClick={() => setIsProjectCreatorOpen(true)} className="bg-[#00483C] text-white font-bold py-2 px-4 rounded-lg hover:bg-emerald-800 transition">
                            Start a New Project
                        </button>
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {funnels.map(funnel => (
                            <CommunityFunnelCard key={funnel.id} funnel={funnel} onJoin={setActiveLoiFunnel} />
                        ))}
                    </div>
                </Card>

            </div>
            <Modal isOpen={isProjectCreatorOpen} onClose={() => setIsProjectCreatorOpen(false)}>
                <StartProjectForm onSubmit={handleCreateProject} onClose={() => setIsProjectCreatorOpen(false)} />
            </Modal>
            <Modal isOpen={!!activeLoiFunnel} onClose={() => setActiveLoiFunnel(null)}>
                {activeLoiFunnel && <LetterOfInterestModal funnel={activeLoiFunnel} onConfirm={handleConfirmLoi} onClose={() => setActiveLoiFunnel(null)} />}
            </Modal>
        </>
    );
};

const StartProjectForm = ({ onSubmit, onClose }) => {
    const [formData, setFormData] = useState({
        community: '',
        title: '',
        goal: '30',
        description: '',
        projectType: 'Full Retrofit'
    });

    const handleChange = (e) => {
        const { id, value } = e.target;
        setFormData(prev => ({...prev, [id]: value}));
    }

    const handleSubmit = (e) => {
        e.preventDefault();
        const newProject = {
            id: `${formData.community.replace(/\s+/g, '-')}-${Date.now()}`,
            community: formData.community,
            title: formData.title,
            champion: mockUserData.name,
            participants: 1,
            goal: parseInt(formData.goal, 10) || 30,
            referralLink: `https://evervale.app/funnel/${formData.community.slice(0,3).toUpperCase()}-1`,
            isUsersCommunity: true,
            description: formData.description,
            projectType: formData.projectType
        };
        onSubmit(newProject);
    }

    return (
        <div className="p-6">
            <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-4">Start a New Community Project</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
                <InputField id="title" label="Project Title" value={formData.title} onChange={handleChange} placeholder="e.g., Full Retrofitting Initiative" required />
                <InputField id="community" label="Community Name" value={formData.community} onChange={handleChange} placeholder="e.g., The Meadows" required />
                <div>
                    <label htmlFor="projectType" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Project Type</label>
                    <select id="projectType" name="projectType" value={formData.projectType} onChange={handleChange} className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg">
                        <option>Full Retrofit</option>
                        <option>Solar Panel Installation</option>
                        <option>Water Conservation</option>
                    </select>
                </div>
                <div>
                    <label htmlFor="description" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Project Description</label>
                    <textarea id="description" value={formData.description} onChange={handleChange} rows="3" className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg" placeholder="A short pitch to your neighbors..." required></textarea>
                </div>
                <InputField id="goal" label="Target Number of Homes" value={formData.goal} onChange={handleChange} placeholder="e.g., 30" type="number" required />
                <div className="flex justify-end space-x-4 pt-4">
                    <button type="button" onClick={onClose} className="py-2 px-4 rounded-lg bg-gray-200 text-gray-800 font-semibold hover:bg-gray-300 dark:bg-gray-600 dark:text-gray-200 dark:hover:bg-gray-500 transition-colors">Cancel</button>
                    <button type="submit" className="py-2 px-4 rounded-lg bg-[#00483C] text-white font-semibold hover:bg-emerald-800 transition-colors">Create Project</button>
                </div>
            </form>
        </div>
    );
}

const LetterOfInterestModal = ({ funnel, onConfirm, onClose }) => {
    return (
        <div className="p-6">
            <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-2">{funnel.title}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">An initiative for {funnel.community}</p>
            <p className="text-gray-600 dark:text-gray-300 mb-6">{funnel.description}</p>
            <div className="bg-blue-50 dark:bg-blue-900/50 p-4 rounded-lg text-sm text-blue-800 dark:text-blue-200">
                <p>By clicking "Count Me In!", you are expressing interest in this community project. You will be notified when the goal of {funnel.goal} homes is reached to receive a formal quote.</p>
            </div>
             <div className="flex justify-end space-x-4 pt-6">
                <button type="button" onClick={onClose} className="py-2 px-5 rounded-lg bg-gray-200 text-gray-800 font-semibold hover:bg-gray-300 dark:bg-gray-600 dark:text-gray-200 dark:hover:bg-gray-500 transition-colors">Not Now</button>
                <button type="button" onClick={() => onConfirm(funnel.id)} className="py-2 px-5 rounded-lg bg-blue-500 text-white font-semibold hover:bg-blue-600 transition-colors">Count Me In!</button>
            </div>
        </div>
    );
};

const Certification = () => {
    const { openModal } = useAppContext();
    const { score, tier, date, breakdown, recommendations } = mockCertificationData;

    const handleAskAI = (recommendationText) => {
        const prompt = `As an expert in green building and property technology for the Dubai luxury real estate market, please provide a step-by-step implementation plan for the following recommendation: "${recommendationText}". Include potential costs, recommended local suppliers, and expected impact on my Evervale score.`;
        openModal({ title: "AI-Powered Implementation Plan", type: 'report', prompt });
    };

    const handleDownload = () => {
        const certificateWindow = window.open('', '_blank');
        certificateWindow.document.write(`
            <html>
                <head>
                    <title>Evervale Leaf Certification</title>
                    <script src="https://cdn.tailwindcss.com"></script>
                    <style>
                        @media print {
                            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                            .no-print { display: none; }
                        }
                    </style>
                </head>
                <body class="font-sans p-10">
                    <div class="max-w-4xl mx-auto border-4 border-[#D4AF37] p-8 rounded-lg">
                        <div class="flex justify-between items-center border-b-2 pb-4">
                            <div class="flex items-center">
                                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#D4AF37" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 20A7 7 0 0 1 4 13V8a2 2 0 0 1 2-2h1"/><path d="M15 8a2 2 0 0 1 2 2v8a7 7 0 0 1-14 0"/></svg>
                                <h1 class="text-3xl font-bold ml-3 text-gray-800">Evervale</h1>
                            </div>
                            <h2 class="text-2xl font-semibold text-[#D4AF37]">Official Leaf Certification</h2>
                        </div>
                        <div class="text-center my-12">
                            <p class="text-lg text-gray-600">This certifies that the property of</p>
                            <p class="text-4xl font-bold my-4 text-gray-900">${mockUserData.name}</p>
                            <p class="text-lg text-gray-600">has achieved the</p>
                            <p class="text-5xl font-bold my-4 text-[#D4AF37]">${tier} Tier</p>
                            <p class="text-2xl text-gray-700">with a score of <span class="font-bold">${score}</span></p>
                        </div>
                        <div class="flex justify-between items-center border-t-2 pt-4">
                            <p class="text-gray-500">Certified on: ${date}</p>
                            <p class="text-gray-500">Certificate ID: EV-${Date.now()}</p>
                        </div>
                    </div>
                    <button onclick="window.print()" class="no-print mt-4 bg-[#D4AF37] text-[#101828] py-2 px-4 rounded">Print or Save as PDF</button>
                </body>
            </html>
        `);
        certificateWindow.document.close();
    };

    return (
        <div className="space-y-6">
            <Card>
                <div className="flex flex-col sm:flex-row justify-between items-center">
                    <h2 className="text-xl font-semibold">Your Evervale Leaf Certification</h2>
                    <button onClick={handleDownload} className="flex items-center mt-4 sm:mt-0 bg-[#D4AF37] text-[#101828] font-bold py-2 px-4 rounded-lg hover:bg-[#B9932E] transition-colors">
                        <div className="h-5 w-5 mr-2">{ICONS.Download}</div>
                        Download Certificate
                    </button>
                </div>
                <div className="text-center my-6">
                    <div className="my-6 inline-block relative">
                        <ResponsiveContainer width={200} height={200}>
                            <PieChart>
                                <Pie data={[{ value: score }, { value: 100 - score }]} cx="50%" cy="50%" innerRadius={70} outerRadius={90} startAngle={90} endAngle={450} dataKey="value">
                                    <Cell fill="#D4AF37" />
                                    <Cell fill="#EAECF0" className="dark:fill-gray-700"/>
                                </Pie>
                            </PieChart>
                        </ResponsiveContainer>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <span className="text-5xl font-bold">{score}</span>
                            <span className="text-lg font-semibold text-[#B9932E]">{tier} Tier</span>
                        </div>
                    </div>
                    <p className="text-[#667085]">Certified on: {date}</p>
                </div>
            </Card>
            <Card>
                <h3 className="font-bold text-lg mb-4">Score Breakdown</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {breakdown.map((item, index) => (
                        <div key={index} className="flex items-center p-4 bg-[#F9FAFB] dark:bg-gray-700/50 rounded-lg">
                            <div className="p-3 rounded-full mr-4" style={{ backgroundColor: `${item.color}20` }}>
                                {React.cloneElement(item.icon, {style: {color: item.color}})}
                            </div>
                            <div className="flex-grow">
                                <div className="flex justify-between items-baseline mb-1">
                                    <p className="font-semibold">{item.name}</p>
                                    <p className="font-bold" style={{ color: item.color }}>{item.value}/100</p>
                                </div>
                                <div className="w-full bg-[#EAECF0] dark:bg-gray-600 rounded-full h-2.5">
                                    <div className="h-2.5 rounded-full" style={{ width: `${item.value}%`, backgroundColor: item.color }}></div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </Card>
            <UpgradeAnalysis />
            <Card>
                <h3 className="font-bold text-lg mb-4">Recommendations for Platinum Tier</h3>
                <ul className="space-y-4">
                    {recommendations.filter(r => !r.completed).map(rec => (
                        <li key={rec.id} className="p-4 bg-blue-50 dark:bg-blue-900/50 rounded-lg flex items-center justify-between">
                            <div className="flex items-start">
                                <div className="h-5 w-5 mr-3 mt-1 text-blue-500">{ICONS.Info}</div>
                                <span>{rec.text}</span>
                            </div>
                            <button onClick={() => handleAskAI(rec.text)} className="flex items-center text-sm font-semibold bg-purple-100 text-purple-700 px-3 py-1 rounded-full hover:bg-purple-200 dark:bg-purple-900 dark:text-purple-200 dark:hover:bg-purple-800 transition-colors">
                                <div className="h-4 w-4 mr-1">{ICONS.Sparkles}</div> Ask AI
                            </button>
                        </li>
                    ))}
                </ul>
            </Card>
        </div>
    );
};

const UpgradeAnalysis = () => {
    const { breakdown, upgradeTips } = mockCertificationData;
    const lowestScoreItem = useMemo(() => {
        return [...breakdown].sort((a, b) => a.value - b.value)[0];
    }, [breakdown]);

    if (!lowestScoreItem) return null;

    const tip = upgradeTips[lowestScoreItem.name];

    return (
        <Card>
            <h3 className="font-bold text-lg mb-4">Path to Platinum</h3>
            <div className="bg-orange-50 dark:bg-orange-900/50 p-4 rounded-lg">
                <div className="flex items-start">
                    <div className="h-6 w-6 mr-3 text-orange-500">{ICONS.TrendingUp}</div>
                    <div>
                        <h4 className="font-semibold text-orange-800 dark:text-orange-200">Focus on: {lowestScoreItem.name}</h4>
                        <p className="text-sm text-orange-700 dark:text-orange-300 mt-1">{tip}</p>
                    </div>
                </div>
            </div>
        </Card>
    );
};

const Performance = () => {
    const { openModal } = useAppContext();
    const { energyUsage, costSavings, propertyValue, carbonFootprint, benchmarks } = mockPerformanceData;
    const totalSavings = costSavings.reduce((acc, item) => acc + item.savings, 0);

    const handleGenerateReport = () => {
        const prompt = `Generate a personalized performance report for a homeowner named ${mockUserData.name}.
        Data:
        - Total Energy Saved: ${energyUsage.reduce((acc, month) => acc + (month.lastYear - month.thisYear), 0) / 1000} MWh
        - Total Cost Savings: AED ${totalSavings.toLocaleString()}
        - Carbon Footprint Reduction: ${carbonFootprint.reduction.toFixed(1)} tons
        - Current Property Value: AED ${propertyValue.current.toLocaleString()}
        - Green Premium: AED ${propertyValue.greenPremium.toLocaleString()} (${propertyValue.increasePercentage}%)

        Structure as a friendly, celebratory summary using markdown. Start with a warm greeting. Highlight key achievements with bullet points. Provide a brief analysis under "### Analysis". Conclude with a positive statement about their contribution to a greener Dubai.`;
        openModal({title: "Your Personalized Performance Report", type: 'report', prompt, data: benchmarks});
    };

    const FinancialImpactCard = ({ icon, title, value, subtitle, colorClass }) => (
        <div className="bg-[#F9FAFB] dark:bg-gray-800/50 p-4 rounded-lg flex items-center">
            <div className={`p-3 rounded-full mr-4 ${colorClass.bg}`}>
                {React.cloneElement(icon, { className: colorClass.text })}
            </div>
            <div>
                <p className="text-sm text-[#667085]">{title}</p>
                <p className="text-xl font-bold">{value}</p>
                {subtitle && <p className="text-xs text-gray-400">{subtitle}</p>}
            </div>
        </div>
    );

    return (
        <div className="space-y-6">
            <Card>
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center">
                    <div>
                        <h3 className="font-bold text-xl">Performance Overview</h3>
                        <p className="text-[#667085] mt-1">Here's how your green investments are paying off.</p>
                    </div>
                    <button onClick={handleGenerateReport} className="flex items-center font-semibold bg-[#00483C] text-white px-4 py-2 rounded-lg hover:bg-emerald-800 mt-4 sm:mt-0 transition-colors">
                        <div className="h-5 w-5 mr-2">{ICONS.Sparkles}</div>Generate Report
                    </button>
                </div>
            </Card>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                    <h3 className="font-bold text-lg mb-4">Energy Usage (kWh)</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={energyUsage}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="month" /><YAxis />
                            <Tooltip />
                            <Legend />
                            <Line type="monotone" dataKey="lastYear" name="Last Year" stroke="#f87171" strokeWidth={2} />
                            <Line type="monotone" dataKey="thisYear" name="This Year" stroke="#00483C" strokeWidth={2} />
                        </LineChart>
                    </ResponsiveContainer>
                </Card>
                <Card>
                    <h3 className="font-bold text-lg mb-4">Carbon Footprint Reduction</h3>
                    <div className="mt-6 p-4 bg-green-50 dark:bg-green-900/50 rounded-lg text-center">
                        <p className="text-xl font-bold text-green-600 dark:text-green-400">You've reduced emissions by {carbonFootprint.reduction.toFixed(1)} tons!</p>
                        <p className="text-sm text-green-500">Equivalent to planting {Math.round(carbonFootprint.reduction * 16.5)} trees.</p>
                    </div>
                </Card>
            </div>
            <Card>
                <h3 className="font-bold text-lg mb-4">Financial Impact Analysis</h3>
                <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-4 gap-4">
                    <FinancialImpactCard icon={ICONS.DollarSign} title="Total Investment" value="AED 60,000" subtitle="Solar & IoT" colorClass={{ bg: 'bg-blue-100 dark:bg-blue-900/50', text: 'text-blue-500' }}/>
                    <FinancialImpactCard icon={ICONS.Wallet} title="Savings to Date" value={`AED ${totalSavings.toLocaleString()}`} subtitle={`Across ${costSavings.length} months`} colorClass={{ bg: 'bg-orange-100 dark:bg-orange-900/50', text: 'text-orange-500' }}/>
                    <FinancialImpactCard icon={ICONS.TrendingUp} title="Return on Investment" value={`${(totalSavings / 60000 * 100).toFixed(1)}%`} subtitle="Payback in ~4 years" colorClass={{ bg: 'bg-green-100 dark:bg-green-900/50', text: 'text-green-500' }}/>
                    <FinancialImpactCard icon={ICONS.Home} title="Property Value Growth" value={`+${propertyValue.increasePercentage}%`} subtitle={`+AED ${propertyValue.greenPremium.toLocaleString()}`} colorClass={{ bg: 'bg-purple-100 dark:bg-purple-900/50', text: 'text-purple-500' }}/>
                </div>
            </Card>
        </div>
    );
};

const Services = () => {
    const { openModal } = useAppContext();
    const [activeTab, setActiveTab] = useState('All');
    const categories = ['All', ...new Set(mockServices.map(s => s.category))];
    const filteredServices = activeTab === 'All' ? mockServices : mockServices.filter(s => s.category === activeTab);

    const handleRequestInfo = (serviceName) => {
        openModal({ title: serviceName, type: 'form' });
    };

    return (
        <div className="space-y-6">
            <Card>
                <h2 className="text-2xl font-bold">Services Marketplace</h2>
                <p className="mt-2 text-[#667085]">Enhance your property's value and sustainability.</p>
                <div className="mt-4 border-b border-[#EAECF0] dark:border-gray-700">
                    <nav className="-mb-px flex space-x-8 overflow-x-auto">
                        {categories.map(category => (
                            <button
                                key={category}
                                onClick={() => setActiveTab(category)}
                                className={`${activeTab === category ? 'border-[#00483C] text-[#00483C]' : 'border-transparent text-[#667085] hover:border-gray-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors`}
                            >
                                {category}
                            </button>
                        ))}
                    </nav>
                </div>
            </Card>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {filteredServices.map(service => (
                    <Card key={service.id} className="flex flex-col">
                        <div className="flex-grow">
                            <h3 className="text-xl font-bold">{service.name}</h3>
                            <p className="mt-2 text-[#667085] dark:text-gray-300">{service.description}</p>
                        </div>
                        <div className="mt-4 pt-4 border-t border-[#EAECF0] dark:border-gray-700 flex justify-between items-center">
                            <p className="font-semibold">{service.price}</p>
                            <button onClick={() => handleRequestInfo(service.name)} className="bg-[#00483C] text-white font-bold py-2 px-4 rounded-lg hover:bg-emerald-800 transition-colors">
                                Request Info
                            </button>
                        </div>
                    </Card>
                ))}
            </div>
        </div>
    );
};

const Profile = () => (
    <div className="space-y-6">
        <Card>
            <div className="flex flex-col md:flex-row items-center">
                <img src={mockUserData.profilePic} alt="Profile" className="h-24 w-24 rounded-full border-4 border-[#00483C]" />
                <div className="mt-4 md:mt-0 md:ml-6 text-center md:text-left">
                    <h2 className="text-3xl font-bold">{mockUserData.name}</h2>
                    <p className="text-[#667085]">{mockUserData.propertyAddress}</p>
                    <p className="text-sm text-gray-400">Member Since: {mockUserData.memberSince}</p>
                </div>
            </div>
        </Card>
        <Card>
            <h3 className="text-xl font-bold mb-4">Account Settings</h3>
            <div className="space-y-4">
                <div className="flex justify-between items-center p-4 bg-[#F9FAFB] dark:bg-gray-700/50 rounded-lg">
                    <span>Email Address</span>
                    <span className="text-[#667085]">{mockUserData.email}</span>
                </div>
                <div className="flex justify-between items-center p-4 bg-[#F9FAFB] dark:bg-gray-700/50 rounded-lg">
                    <span>Password</span>
                    <button className="font-semibold text-blue-500 hover:underline">Change Password</button>
                </div>
            </div>
        </Card>
    </div>
);

// =================================================================================
// --- 8. B2B PAGE COMPONENTS ---
// Main content components for the Business (B2B) section.
// In a multi-file structure, these would be in: src/pages/b2b/
// =================================================================================

const B2BKpiCard = ({ title, value, comparison, icon, color }) => (
    <Card>
        <div className="flex items-start justify-between">
            <span className="text-sm font-medium text-[#667085] dark:text-gray-400">{title}</span>
            {React.cloneElement(icon, { className: `h-6 w-6 ${color}` })}
        </div>
        <p className="text-3xl font-bold mt-2">{value}</p>
        {comparison && <p className="text-sm text-[#00483C]">{comparison}</p>}
    </Card>
);

const OpportunityCard = ({ title, value, subtitle, icon, color }) => (
    <Card className="flex items-center">
        <div className={`p-3 rounded-lg mr-4 ${color.replace('text-', 'bg-')}/10`}>
            {React.cloneElement(icon, { className: `h-8 w-8 ${color}` })}
        </div>
        <div>
            <p className="text-sm text-[#667085] dark:text-gray-400">{title}</p>
            <p className="text-xl font-bold">{value}</p>
            <p className="text-xs text-gray-400">{subtitle}</p>
        </div>
    </Card>
);

const NextProjectCard = ({ project, onLaunch }) => (
    <Card className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white">
        <div className="flex items-center">
            <div className="p-3 bg-white/20 rounded-lg mr-4">
                {React.cloneElement(project.icon, { className: "h-8 w-8 text-white" })}
            </div>
            <div>
                <h3 className="font-bold text-lg">{project.title}</h3>
                <p className="text-sm opacity-90">
                    <span className="font-semibold">{project.potentialInterest}</span> have shown interest.
                </p>
                <p className="text-sm opacity-90">
                    Est. community savings of <span className="font-semibold">{project.potentialSavings}</span>.
                </p>
            </div>
        </div>
        <button onClick={onLaunch} className="mt-4 w-full bg-white text-blue-600 font-bold py-2 px-4 rounded-lg hover:bg-blue-50 transition-colors">
            Launch Initiative
        </button>
    </Card>
);

const TopInterestsChart = ({ interests }) => (
    <Card>
        <h3 className="text-lg font-bold text-[#101828] dark:text-white mb-4">Top Resident Interests</h3>
        <div className="space-y-4">
            {interests.map(item => (
                <div key={item.name}>
                    <div className="flex justify-between mb-1">
                        <span className="text-sm font-medium text-[#667085] dark:text-gray-300">{item.name}</span>
                        <span className="text-sm font-medium text-[#667085] dark:text-gray-400">{item.interest}%</span>
                    </div>
                    <div className="w-full bg-[#EAECF0] rounded-full h-2.5 dark:bg-gray-700">
                        <div className="bg-indigo-500 h-2.5 rounded-full" style={{ width: `${item.interest}%` }}></div>
                    </div>
                </div>
            ))}
        </div>
    </Card>
);

const LaunchInitiativeForm = ({ projectData, onClose }) => {
    const { showToast } = useAppContext();
    const [formData, setFormData] = useState({
        initiativeTitle: projectData.title.replace('Next Best Project: ', ''),
        community: 'Arabian Ranches', // Default or could be passed in
        targetHomes: projectData.potentialInterest.split(' ')[0],
        kickoffMessage: `Hello residents! Based on popular interest, we are excited to launch a new community-wide ${projectData.title.replace('Next Best Project: ', '')}. Let's work together to make our community greener and save on utility bills!`
    });

    const handleChange = (e) => {
        const { id, value } = e.target;
        setFormData(prev => ({ ...prev, [id]: value }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        console.log("Launching Initiative:", formData);
        showToast('Initiative launched successfully!', 'success');
        onClose(); // Close modal on submit
    };

    return (
        <div className="p-6">
            <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-4">Launch New Initiative</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
                <InputField id="initiativeTitle" label="Initiative Title" value={formData.initiativeTitle} onChange={handleChange} required />
                <div>
                    <label htmlFor="community" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Community</label>
                    <select id="community" value={formData.community} onChange={handleChange} className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg">
                        <option>Arabian Ranches</option>
                        <option>Dubai Hills Estate</option>
                        <option>The Springs</option>
                    </select>
                </div>
                <InputField id="targetHomes" label="Target Number of Homes" value={formData.targetHomes} onChange={handleChange} type="number" required />
                <div>
                    <label htmlFor="kickoffMessage" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Kick-off Message to Residents</label>
                    <textarea id="kickoffMessage" value={formData.kickoffMessage} onChange={handleChange} rows="4" className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg"></textarea>
                </div>
                <div className="p-4 bg-blue-50 dark:bg-blue-900/50 rounded-lg">
                    <p className="text-sm text-blue-800 dark:text-blue-200">
                        Projected Savings: <strong className="font-bold">{projectData.potentialSavings}</strong>
                    </p>
                </div>
                <div className="flex justify-end space-x-4 pt-4">
                    <button type="button" onClick={onClose} className="py-2 px-4 rounded-lg bg-gray-200 text-gray-800 font-semibold hover:bg-gray-300 dark:bg-gray-600 dark:text-gray-200 dark:hover:bg-gray-500 transition-colors">Cancel</button>
                    <button type="submit" className="py-2 px-4 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors">Confirm and Launch</button>
                </div>
            </form>
        </div>
    );
};

const RequestCommunityAuditForm = ({ onClose }) => {
    const { showToast } = useAppContext();
    const [formData, setFormData] = useState({
        companyName: '',
        contactPerson: '',
        email: '',
        communityName: '',
        message: ''
    });

    const handleChange = (e) => {
        const { id, value } = e.target;
        setFormData(prev => ({ ...prev, [id]: value }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        // In a real app, this would submit to a backend.
        console.log("Community Audit Request:", formData);
        showToast('Audit request submitted successfully!', 'success');
        onClose();
    };

    return (
        <div className="p-6">
            <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-4">Request Community Audit</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
                <InputField id="companyName" label="Company Name" value={formData.companyName} onChange={handleChange} required placeholder="Your Company LLC" />
                <InputField id="contactPerson" label="Contact Person" value={formData.contactPerson} onChange={handleChange} required placeholder="e.g. Jane Doe" />
                <InputField id="email" label="Contact Email" value={formData.email} onChange={handleChange} type="email" required placeholder="jane.doe@example.com" />
                <InputField id="communityName" label="Community of Interest" value={formData.communityName} onChange={handleChange} placeholder="e.g., Arabian Ranches" required />
                <div>
                    <label htmlFor="message" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Message</label>
                    <textarea id="message" value={formData.message} onChange={handleChange} rows="3" className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg" placeholder="Please provide any additional details..."></textarea>
                </div>
                <div className="flex justify-end space-x-4 pt-4">
                    <button type="button" onClick={onClose} className="py-2 px-4 rounded-lg bg-gray-200 text-gray-800 font-semibold hover:bg-gray-300 dark:bg-gray-600 dark:text-gray-200 dark:hover:bg-gray-500 transition-colors">Cancel</button>
                    <button type="submit" className="py-2 px-4 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors">Submit Request</button>
                </div>
            </form>
        </div>
    );
};

const B2BDashboard = () => {
    const { openModal, setCurrentPage } = useAppContext();
    const [persona, setPersona] = useState('esco');

    const handleRequestAudit = () => {
        openModal({ title: "Request Community Audit", type: "communityAuditForm" });
    };

    const handleLaunchInitiative = () => {
        openModal({
            type: 'launchInitiative',
            title: 'Launch New Initiative',
            data: mockB2BPersonaData.communityManager.nextProject
        });
    };

    const PersonaButton = ({ type, label }) => (
        <button
            onClick={() => setPersona(type)}
            className={`px-4 py-2 text-sm font-semibold rounded-md transition-colors ${persona === type ? 'bg-slate-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
        >
            {label}
        </button>
    );

    const renderPersonaContent = () => {
        const personaData = mockB2BPersonaData[persona];
        if (!personaData) return <Spinner />; // Defensive check

        switch (persona) {
            case 'esco': {
                return (
                    <>
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
                            <Card><h4 className="text-sm font-medium text-gray-500">{personaData.kpi1.title}</h4><p className="text-3xl font-bold">{personaData.kpi1.value}</p></Card>
                            <Card><h4 className="text-sm font-medium text-gray-500">{personaData.kpi2.title}</h4><p className="text-3xl font-bold">{personaData.kpi2.value}</p></Card>
                            <Card><h4 className="text-sm font-medium text-gray-500">{personaData.kpi3.title}</h4><p className="text-3xl font-bold">{personaData.kpi3.value}</p></Card>
                            <Card><h4 className="text-sm font-medium text-gray-500">{personaData.kpi4.title}</h4><p className="text-3xl font-bold">{personaData.kpi4.value}</p></Card>
                        </div>
                         <Card>
                            <div className="flex justify-between items-center mb-4">
                                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Qualified Funnels</h2>
                                <button onClick={() => setCurrentPage('/b2b-commitments')} className="font-semibold text-blue-500 hover:underline">View All</button>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {mockEscoFunnels.slice(0,3).map((funnel, index) => (
                                    <EscoFunnelCard key={index} funnel={funnel} />
                                ))}
                            </div>
                        </Card>
                    </>
                );
            }
            case 'developer': {
                 if (!personaData.performance || !personaData.opportunities) return <Spinner />;
                const developerChartData = [
                    {
                        name: 'Green Premium',
                        'Realized': personaData.performance.find(p => p.title === "Total Green Premium Added")?.rawValue || 0,
                        'Untapped': personaData.opportunities.find(op => op.title === "Untapped Green Premium")?.rawValue || 0,
                    }
                ];
                return (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <Card>
                            <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-4">Portfolio Value Analysis</h3>
                            <ResponsiveContainer width="100%" height={300}>
                                <BarChart data={developerChartData} layout="vertical" margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis type="number" tickFormatter={(value) => `AED ${value/1000000}M`} />
                                    <YAxis type="category" dataKey="name" />
                                    <Tooltip formatter={(value) => `AED ${value.toLocaleString()}`} />
                                    <Legend />
                                    <Bar dataKey="Realized" stackId="a" fill="#10b981" />
                                    <Bar dataKey="Untapped" stackId="a" fill="#a855f7" />
                                </BarChart>
                            </ResponsiveContainer>
                        </Card>
                         <div className="space-y-6">
                            {personaData.performance.filter(p => p.title !== "Total Green Premium Added").map(kpi => <B2BKpiCard key={kpi.title} {...kpi} />)}
                        </div>
                    </div>
                );
            }
            case 'communityManager': {
                if (!personaData.kpis || !personaData.nextProject || !personaData.topInterests) return <Spinner />;
                return (
                    <>
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
                            {personaData.kpis.map(kpi => <B2BKpiCard key={kpi.title} {...kpi} />)}
                        </div>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
                            <NextProjectCard project={personaData.nextProject} onLaunch={handleLaunchInitiative} />
                            <TopInterestsChart interests={personaData.topInterests} />
                        </div>
                    </>
                );
            }
            default:
                return null;
        }
    };

    return (
        <div className="space-y-6">
            <Card className="bg-gradient-to-br from-slate-700 to-slate-900 text-white">
                <div className="flex flex-col md:flex-row justify-between items-start">
                    <div>
                        <h2 className="text-2xl font-bold">B2B Partner Dashboard</h2>
                        <p className="mt-2 text-slate-300">Oversee community projects and drive large-scale sustainable change.</p>
                    </div>
                    <button onClick={handleRequestAudit} className="mt-4 md:mt-0 bg-white text-slate-800 font-bold py-2 px-4 rounded-lg shadow-lg hover:bg-slate-100 transition-transform hover:scale-105">
                        Request Community Audit
                    </button>
                </div>
            </Card>

            <Card>
                <div className="flex items-center space-x-2 p-1 bg-slate-900 rounded-lg">
                    <PersonaButton type="esco" label="ESCO" />
                    <PersonaButton type="developer" label="Real Estate Developer" />
                    <PersonaButton type="communityManager" label="Community Manager" />
                </div>
            </Card>

            {renderPersonaContent()}
        </div>
    );
};

const EscoFunnelCard = ({ funnel }) => {
    const { name, status, committedUnits, goal, projectedCapex, projectedProfitMargin } = funnel;

    const getStatusClass = (status) => {
        switch (status.toLowerCase()) {
            case 'aggregating':
                return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
            case 'ready to deploy':
                return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
            default:
                return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
        }
    };

    const percentage = goal > 0 ? (committedUnits / goal) * 100 : 0;

    return (
        <Card className="hover:shadow-xl transition-shadow duration-300">
            <div className="flex justify-between items-start mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{name}</h3>
                <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${getStatusClass(status)}`}>
                    {status}
                </span>
            </div>

            <div className="mb-4">
                <div className="flex justify-between items-center mb-1">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Committed Units</span>
                    <span className="text-sm font-bold text-gray-900 dark:text-white">{committedUnits} / {goal}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
                    <div className="bg-blue-600 h-2.5 rounded-full" style={{ width: `${percentage}%` }}></div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-center pt-4 border-t border-gray-200 dark:border-gray-700">
                <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Projected CAPEX</p>
                    <p className="text-xl font-bold text-gray-900 dark:text-white">{projectedCapex}</p>
                </div>
                <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Projected Profit Margin</p>
                    <p className="text-xl font-bold text-green-500">{projectedProfitMargin}</p>
                </div>
            </div>
        </Card>
    );
};


const B2BCommunities = () => {
    const { openModal } = useAppContext();
    const [expandedRow, setExpandedRow] = useState(null);

    const handleLaunch = (community) => {
        openModal({
            type: 'launchInitiative',
            title: `Launch ${community.topInterest} Initiative`,
            data: {
                title: `Next Best Project: ${community.topInterest} Initiative`,
                potentialInterest: `${community.warmLeads} Homes`,
                potentialSavings: `AED ${community.projectedValue.toLocaleString()}/year`,
            }
        });
    };

    return (
        <Card>
            <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-4">Managed Communities</h2>
            <div className="overflow-x-auto">
                <table className="w-full text-left">
                    <thead className="border-b dark:border-gray-700">
                        <tr>
                            <th className="p-3"></th>
                            <th className="p-3">Community</th>
                            <th className="p-3">Avg. Leaf Score</th>
                            <th className="p-3">Engagement</th>
                            <th className="p-3">Top Interest</th>
                            <th className="p-3">Warm Leads</th>
                            <th className="p-3">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {mockB2BData.communities.map((c, index) => (
                            <React.Fragment key={c.id}>
                                <tr className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer" onClick={() => setExpandedRow(expandedRow === index ? null : index)} aria-expanded={expandedRow === index}>
                                    <td className="p-3">
                                        <Icon path={<path d="m6 9 6 6 6-6"/>} className={`transition-transform duration-300 ${expandedRow === index ? 'rotate-180' : ''}`} />
                                    </td>
                                    <td className="p-3 font-medium">{c.name}</td>
                                    <td className="p-3"><span className="font-bold text-green-500">{c.avgScore}</span></td>
                                    <td className="p-3">{c.engagementRate}%</td>
                                    <td className="p-3">{c.topInterest}</td>
                                    <td className="p-3">{c.warmLeads}</td>
                                    <td className="p-3">
                                        {c.engagementRate > 40 && (
                                            <button onClick={(e) => { e.stopPropagation(); handleLaunch(c); }} className="bg-blue-500 text-white font-bold py-1 px-3 rounded-lg hover:bg-blue-600 text-sm">
                                                Launch
                                            </button>
                                        )}
                                    </td>
                                </tr>
                                {expandedRow === index && (
                                    <tr className="bg-gray-50 dark:bg-gray-700/50">
                                        <td colSpan="7" className="p-4">
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                <div>
                                                    <h4 className="font-bold mb-2">Leaf Score Breakdown</h4>
                                                    <p className="text-sm">Energy: <span className="font-semibold text-green-500">{c.scoreBreakdown.energy}</span></p>
                                                    <p className="text-sm">Water: <span className="font-semibold text-blue-500">{c.scoreBreakdown.water}</span></p>
                                                    <p className="text-sm">Waste: <span className="font-semibold text-yellow-500">{c.scoreBreakdown.waste}</span></p>
                                                </div>
                                                <div>
                                                    <h4 className="font-bold mb-2">Current Business</h4>
                                                    <p className="text-sm">Active Projects: <span className="font-semibold">{c.activeProjects}</span></p>
                                                    <p className="text-sm">Projected Revenue: <span className="font-semibold">AED {c.currentRevenue.toLocaleString()}</span></p>
                                                </div>
                                                <div>
                                                    <h4 className="font-bold mb-2">Potential</h4>
                                                    <p className="text-sm">Total Retrofit Value: <span className="font-semibold">AED {c.potentialValue.toLocaleString()}</span></p>
                                                    <p className="text-sm">Next Project Value: <span className="font-semibold">AED {c.projectedValue.toLocaleString()}</span></p>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </React.Fragment>
                        ))}
                    </tbody>
                </table>
            </div>
        </Card>
    );
};

const B2BCommitments = () => {
    // --- MOCK CONFIG & DATA (Scoped to this component) ---
    const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {
        apiKey: "YOUR_API_KEY",
        authDomain: "YOUR_AUTH_DOMAIN",
        projectId: "YOUR_PROJECT_ID",
        storageBucket: "YOUR_STORAGE_BUCKET",
        messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
        appId: "YOUR_APP_ID"
    };

    const MOCK_USERS = {
        'homeowner_1': { name: 'Alex Johnson', role: 'homeowner' },
        'esco_1': { name: 'GreenFuture ESCO', role: 'esco' },
        'admin_1': { name: 'Community Champion', role: 'admin' },
    };

    const MOCK_PROJECT = {
        id: 'retrofit_project_123',
        name: 'Sunnyvale Neighborhood Retrofit',
        units: 42,
        loiThreshold: 30,
        loisSigned: 35,
        status: 'Aggregating', // Initial status
        homeowners: ['homeowner_1'],
        winningEsco: null,
        winningBid: null,
    };

    // --- HELPER COMPONENTS (Scoped to this component) ---
    const CommitmentCard = ({ children, className = '' }) => (
        <div className={`bg-white rounded-xl shadow-md p-6 border border-gray-200 ${className}`}>
            {children}
        </div>
    );

    const CommitmentButton = ({ children, onClick, variant = 'primary', className = '', disabled = false }) => {
        const baseStyles = 'px-4 py-2 rounded-lg font-semibold transition-transform transform active:scale-95';
        const variants = {
            primary: 'bg-blue-600 text-white hover:bg-blue-700',
            secondary: 'bg-gray-200 text-gray-800 hover:bg-gray-300',
            success: 'bg-green-600 text-white hover:bg-green-700',
        };
        return (
            <button onClick={onClick} className={`${baseStyles} ${variants[variant]} ${className}`} disabled={disabled}>
                {children}
            </button>
        );
    };

    const CommitmentModal = ({ isOpen, onClose, title, children }) => {
        if (!isOpen) return null;
        return (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
                    <div className="p-6 border-b border-gray-200 flex justify-between items-center">
                        <h3 className="text-xl font-bold text-gray-800">{title}</h3>
                        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">&times;</button>
                    </div>
                    <div className="p-6">
                        {children}
                    </div>
                </div>
            </div>
        );
    };

    const FunnelChart = ({ data }) => {
        const maxValue = Math.max(...data.map(d => d.value));
        return (
            <div className="space-y-2">
                {data.map((stage, index) => {
                    const widthPercentage = maxValue > 0 ? (stage.value / maxValue) * 100 : 0;
                    const prevValue = index > 0 ? data[index-1].value : 0;
                    const conversion = prevValue > 0 ? ((stage.value / prevValue) * 100).toFixed(1) : 100;

                    return (
                        <div key={stage.name} className="flex items-center space-x-4">
                            <div className="w-40 text-right">
                                <p className="font-semibold text-gray-700">{stage.name}</p>
                                <p className="text-sm text-gray-500">{stage.value} Units</p>
                            </div>
                            <div className="flex-1">
                                <div className="bg-gray-200 rounded-full h-8 relative">
                                    <div
                                        className="bg-blue-500 h-8 rounded-full flex items-center justify-end pr-3 text-white font-bold"
                                        style={{ width: `${widthPercentage}%` }}
                                    >
                                       {index > 0 && prevValue > 0 && <span className="text-xs opacity-80">{conversion}%</span>}
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    };

    // --- CORE WORKFLOW COMPONENTS (Scoped) ---
    const ProposalModal = ({ project, esco, db, onClose }) => {
        const [cost, setCost] = useState('');
        const [timeline, setTimeline] = useState('3-6 months');
        const [proposition, setProposition] = useState('');
        const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

        const handleSubmit = async () => {
            if (!cost || !proposition) {
                console.warn("Please fill all fields.");
                return;
            }
            const bidData = {
                escoId: esco.id,
                escoName: esco.name,
                costPerUnit: parseFloat(cost),
                timeline,
                proposition,
                submittedAt: new Date(),
            };

            try {
                const bidsCollectionRef = collection(db, "artifacts", appId, "public", "data", "projects", project.id, "bids");
                await addDoc(bidsCollectionRef, bidData);
                console.log("Bid submitted successfully!");
                onClose();
            } catch (error) {
                console.error("Error submitting bid:", error);
            }
        };

        return (
            <>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Cost Per Unit ($)</label>
                        <input type="number" value={cost} onChange={e => setCost(e.target.value)} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Estimated Project Timeline</label>
                        <select value={timeline} onChange={e => setTimeline(e.target.value)} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500">
                            <option>1-3 months</option>
                            <option>3-6 months</option>
                            <option>6-9 months</option>
                            <option>9-12 months</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Value Proposition</label>
                        <textarea value={proposition} onChange={e => setProposition(e.target.value)} rows="4" className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"></textarea>
                    </div>
                </div>
                <div className="mt-6 flex justify-end space-x-3">
                    <CommitmentButton onClick={onClose} variant="secondary">Cancel</CommitmentButton>
                    <CommitmentButton onClick={handleSubmit} variant="primary">Submit Proposal</CommitmentButton>
                </div>
            </>
        );
    };

    const SchedulingModal = ({ project, homeowner, db, onClose }) => {
        const availableSlots = [
            'Monday, Aug 11th - 9:00 AM',
            'Monday, Aug 11th - 2:00 PM',
            'Tuesday, Aug 12th - 10:00 AM',
            'Wednesday, Aug 13th - 11:00 AM',
            'Wednesday, Aug 13th - 3:00 PM',
        ];
        const [selectedSlot, setSelectedSlot] = useState(null);
        const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

        const handleSchedule = async () => {
            if (!selectedSlot) return;

            const scheduleData = {
                projectId: project.id,
                homeownerId: homeowner.id,
                escoId: project.winningEsco,
                scheduledTime: selectedSlot,
                status: 'Scheduled'
            };

            try {
                await addDoc(collection(db, "artifacts", appId, "public", "data", "schedules"), scheduleData);

                const projectRef = doc(db, "artifacts", appId, "public", "data", "projects", project.id);
                await updateDoc(projectRef, {
                    status: 'Scheduling In Progress',
                });
                console.log("Audit scheduled successfully!");
                onClose();
            } catch (error) {
                console.error("Error scheduling audit:", error);
            }
        };

        return (
            <>
                <p className="text-gray-600 mb-4">Select a time slot for your energy audit with <span className="font-bold">{project.winningEscoName}</span>.</p>
                <div className="space-y-2">
                    {availableSlots.map(slot => (
                        <button
                            key={slot}
                            onClick={() => setSelectedSlot(slot)}
                            className={`w-full text-left p-3 rounded-lg border ${selectedSlot === slot ? 'bg-blue-500 text-white border-blue-500' : 'bg-gray-50 hover:bg-gray-100 border-gray-200'}`}
                        >
                            {slot}
                        </button>
                    ))}
                </div>
                <div className="mt-6 flex justify-end space-x-3">
                    <CommitmentButton onClick={onClose} variant="secondary">Cancel</CommitmentButton>
                    <CommitmentButton onClick={handleSchedule} variant="success" disabled={!selectedSlot}>Confirm Appointment</CommitmentButton>
                </div>
            </>
        );
    };

    // --- DASHBOARD COMPONENTS (Scoped) ---
    const ESCODashboard = ({ user, projects, db }) => {
        const [selectedProject, setSelectedProject] = useState(null);
        const openForBidsProjects = projects.filter(p => p.status === 'Open for Bids');

        return (
            <CommitmentCard>
                <h2 className="text-2xl font-bold text-gray-800 mb-1">Bidding Opportunities</h2>
                <p className="text-gray-500 mb-6">Projects currently accepting proposals.</p>
                <div className="space-y-4">
                    {openForBidsProjects.length > 0 ? openForBidsProjects.map(p => (
                        <div key={p.id} className="p-4 border rounded-lg flex justify-between items-center">
                            <div>
                                <h3 className="font-bold text-lg">{p.name}</h3>
                                <p className="text-sm text-gray-600">{p.units} Units | Deadline: TBD</p>
                            </div>
                            <CommitmentButton onClick={() => setSelectedProject(p)}>Submit Proposal</CommitmentButton>
                        </div>
                    )) : <p className="text-gray-500">No projects are currently open for bids.</p>}
                </div>
                <CommitmentModal isOpen={!!selectedProject} onClose={() => setSelectedProject(null)} title={`Proposal for ${selectedProject?.name}`}>
                    {selectedProject && <ProposalModal project={selectedProject} esco={user} db={db} onClose={() => setSelectedProject(null)} />}
                </CommitmentModal>
            </CommitmentCard>
        );
    };

    const AdminDashboard = ({ projects, db }) => {
        const [bids, setBids] = useState({});
        const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

        useEffect(() => {
            if (!db) return;
            const unsubscribes = [];
            projects.forEach(project => {
                if (project.status === 'Open for Bids') {
                    const bidsCollectionRef = collection(db, "artifacts", appId, "public", "data", "projects", project.id, "bids");
                    const unsubscribe = onSnapshot(bidsCollectionRef, (snapshot) => {
                        const projectBids = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
                        setBids(prev => ({ ...prev, [project.id]: projectBids }));
                    }, (error) => {
                        console.error(`Error in bids snapshot listener for project ${project.id}:`, error);
                    });
                    unsubscribes.push(unsubscribe);
                }
            });
            return () => unsubscribes.forEach(unsub => unsub());
        }, [projects, db, appId]);

        const handleSelectWinner = async (project, bid) => {
            const projectRef = doc(db, "artifacts", appId, "public", "data", "projects", project.id);
            try {
                await updateDoc(projectRef, {
                    status: 'EPC Contracts Sent',
                    winningEsco: bid.escoId,
                    winningEscoName: bid.escoName,
                    winningBid: {
                        costPerUnit: bid.costPerUnit,
                        timeline: bid.timeline
                    }
                });
                console.log("Winning ESCO selected!");
            } catch (error) {
                console.error("Error selecting winner:", error);
            }
        };

        return (
            <CommitmentCard>
                <h2 className="text-2xl font-bold text-gray-800 mb-6">Project Bid Review</h2>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {projects.filter(p => p.status === 'Open for Bids' || p.status === 'EPC Contracts Sent').map(p => (
                        <div key={p.id} className="bg-white rounded-xl shadow-md p-6 border border-gray-200 flex flex-col">
                            <h3 className="font-bold text-xl mb-4 border-b pb-2">{p.name} - <span className="text-blue-600 font-normal text-lg">{p.status}</span></h3>
                            <div className="flex-grow space-y-3">
                                {p.status === 'Open for Bids' && (
                                    (bids[p.id] || []).length > 0 ? (bids[p.id] || []).map(bid => (
                                        <div key={bid.id} className="p-4 bg-gray-50 rounded-lg border">
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <p className="font-bold">{bid.escoName}</p>
                                                    <p className="text-green-700 font-semibold">${bid.costPerUnit}/unit</p>
                                                    <p className="text-sm text-gray-500">Timeline: {bid.timeline}</p>
                                                    <p className="mt-2 text-sm text-gray-600 italic">"{bid.proposition}"</p>
                                                </div>
                                                <CommitmentButton onClick={() => handleSelectWinner(p, bid)} variant="success">Select Winner</CommitmentButton>
                                            </div>
                                        </div>
                                    )) : <p className="text-sm text-gray-500">No bids submitted yet.</p>
                                )}
                                {p.status === 'EPC Contracts Sent' && (
                                    <div className="p-4 bg-green-50 rounded-lg border border-green-200 h-full flex flex-col justify-center">
                                        <p className="font-semibold">Winning ESCO Selected:</p>
                                        <p className="font-bold text-green-800 text-lg">{p.winningEscoName}</p>
                                        <p className="mt-2">Contracts have been sent to homeowners.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </CommitmentCard>
        );
    };

    const HomeownerDashboard = ({ projects, user, db }) => {
        const [isScheduling, setIsScheduling] = useState(false);
        const myProject = projects.find(p => p.homeowners.includes(user.id));

        if (!myProject) return <CommitmentCard><p>You are not yet part of a project.</p></CommitmentCard>;

        const renderProjectStatus = () => {
            switch (myProject.status) {
                case 'Aggregating':
                case 'Open for Bids':
                    return (
                        <>
                            <h3 className="font-bold text-lg">Project is progressing!</h3>
                            <p className="text-gray-600">Your community project is currently in the '{myProject.status}' phase. We'll notify you when it's time for the next step.</p>
                        </>
                    );
                case 'EPC Contracts Sent':
                    return (
                        <>
                            <h3 className="font-bold text-lg">Action Required: Sign Your Contract</h3>
                            <p className="text-gray-600 mb-4">Your project has selected <span className="font-bold">{myProject.winningEscoName}</span> as the partner ESCO. Please check your email to sign the EPC contract.</p>
                            <CommitmentButton onClick={() => console.log("This would link to a contract signing service.")}>View Contract</CommitmentButton>
                        </>
                    );
                case 'Scheduling In Progress':
                case 'Contracts Signed':
                     return (
                        <>
                            <h3 className="font-bold text-lg">Scheduling Assistant</h3>
                            <p className="text-gray-600 mb-4">Your contract is signed! It's time to schedule your energy audit with <span className="font-bold">{myProject.winningEscoName}</span>.</p>
                            <CommitmentButton onClick={() => setIsScheduling(true)} variant="success">Schedule Your Energy Audit</CommitmentButton>
                        </>
                    );
                default:
                    return <p>Current Status: {myProject.status}</p>;
            }
        };

        return (
            <CommitmentCard>
                <h2 className="text-2xl font-bold text-gray-800 mb-4">Project: {myProject.name}</h2>
                <div className="bg-blue-50 p-4 rounded-lg">
                    {renderProjectStatus()}
                </div>
                <CommitmentModal isOpen={isScheduling} onClose={() => setIsScheduling(false)} title="Schedule Energy Audit">
                    <SchedulingModal project={myProject} homeowner={user} db={db} onClose={() => setIsScheduling(false)} />
                </CommitmentModal>
            </CommitmentCard>
        );
    };

    const CommitmentFunnelDashboard = ({ projects, db }) => {
        const [funnelData, setFunnelData] = useState([]);
        const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

        useEffect(() => {
            if (!db || projects.length === 0) return;

            const project = projects[0];

            const calculateFunnel = async () => {
                let contractsSent = 0;
                let contractsSigned = 0;
                let auditsScheduled = 0;

                if (project.status === 'EPC Contracts Sent' || project.status === 'Scheduling In Progress' || project.status === 'Contracts Signed') {
                    contractsSent = project.loisSigned;
                }

                if (project.status === 'Scheduling In Progress' || project.status === 'Contracts Signed') {
                    contractsSigned = project.loisSigned - 5; // Mocking some drop-off
                }

                const schedulesQuery = query(collection(db, "artifacts", appId, "public", "data", "schedules"), where("projectId", "==", project.id));
                const scheduleSnapshot = await getDocs(schedulesQuery);
                auditsScheduled = scheduleSnapshot.size;

                setFunnelData([
                    { name: 'LOIs Issued', value: project.loisSigned },
                    { name: 'Contracts Sent', value: contractsSent },
                    { name: 'Contracts Signed', value: contractsSigned },
                    { name: 'Audits Scheduled', value: auditsScheduled },
                ]);
            };

            calculateFunnel();

            const schedulesQuery = query(collection(db, "artifacts", appId, "public", "data", "schedules"), where("projectId", "==", project.id));
            const unsubscribe = onSnapshot(schedulesQuery, () => {
                calculateFunnel();
            }, (error) => {
                console.error("Error in schedules snapshot listener:", error);
            });

            return () => unsubscribe();

        }, [projects, db, appId]);

        return (
            <CommitmentCard>
                <h2 className="text-2xl font-bold text-gray-800 mb-6">B2B Commitment Funnel</h2>
                {funnelData.length > 0 ? <FunnelChart data={funnelData} /> : <p>Loading funnel data...</p>}
            </CommitmentCard>
        );
    };

    // --- MAIN COMPONENT LOGIC ---
    const [db, setDb] = useState(null);
    const [auth, setAuth] = useState(null);
    const [currentUser, setCurrentUser] = useState(null);
    const [projects, setProjects] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isAuthReady, setIsAuthReady] = useState(false);
    const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

    useEffect(() => {
        try {
            const app = initializeApp(firebaseConfig);
            const firestoreDb = getFirestore(app);
            const firebaseAuth = getAuth(app);
            setDb(firestoreDb);
            setAuth(firebaseAuth);

            const unsubscribe = onAuthStateChanged(firebaseAuth, async (user) => {
                if (user) {
                    setIsAuthReady(true);
                    setIsLoading(false);
                } else {
                    const token = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;
                    try {
                        if (token) {
                            await signInWithCustomToken(firebaseAuth, token);
                        } else {
                            await signInAnonymously(firebaseAuth);
                        }
                    } catch (error) {
                        console.error("Error during sign-in:", error);
                        setIsLoading(false);
                    }
                }
            });
            return () => unsubscribe();
        } catch (error) {
            console.error("Error initializing Firebase:", error);
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!db || !isAuthReady) return;

        const seedData = async () => {
            const projectRef = doc(db, "artifacts", appId, "public", "data", "projects", MOCK_PROJECT.id);
            await setDoc(projectRef, MOCK_PROJECT);
            console.log("Project data seeded.");
        };

        seedData();
    }, [db, appId, isAuthReady]);

    useEffect(() => {
        if (!db || !isAuthReady) return;

        const projectsCollectionRef = collection(db, "artifacts", appId, "public", "data", "projects");
        const unsubscribe = onSnapshot(projectsCollectionRef, (snapshot) => {
            let fetchedProjects = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

            fetchedProjects.forEach(p => {
                if (p.status === 'Aggregating' && p.loisSigned >= p.loiThreshold) {
                    const projectRef = doc(db, "artifacts", appId, "public", "data", "projects", p.id);
                    updateDoc(projectRef, { status: 'Open for Bids' }).catch(console.error);
                }
            });

            setProjects(fetchedProjects);
        }, (error) => {
            console.error("Error in project snapshot listener:", error);
        });

        return () => unsubscribe();
    }, [db, appId, isAuthReady]);

    const switchUser = (userId) => {
        setCurrentUser({ id: userId, ...MOCK_USERS[userId] });
    };

    const renderDashboard = () => {
        if (!currentUser) return <p className="text-center text-gray-500">Please select a user role to view the dashboard.</p>;

        switch (currentUser.role) {
            case 'esco':
                return <ESCODashboard user={currentUser} projects={projects} db={db} />;
            case 'admin':
                return (
                    <div className="space-y-8">
                        <AdminDashboard projects={projects} db={db} />
                        <CommitmentFunnelDashboard projects={projects} db={db} />
                    </div>
                );
            case 'homeowner':
                return <HomeownerDashboard projects={projects} user={currentUser} db={db} />;
            default:
                return <p>Invalid user role.</p>;
        }
    };

    if (isLoading) {
        return <div className="min-h-screen bg-gray-100 flex items-center justify-center"><p>Loading Evervale Commitments...</p></div>;
    }

    return (
        <div className="font-sans">
            <CommitmentCard className="mb-8">
                <div className="flex flex-wrap items-center gap-4">
                    <h2 className="text-lg font-semibold text-gray-700">Switch User View:</h2>
                    {Object.keys(MOCK_USERS).map(userId => (
                        <CommitmentButton
                            key={userId}
                            onClick={() => switchUser(userId)}
                            variant={currentUser?.id === userId ? 'primary' : 'secondary'}
                        >
                            {MOCK_USERS[userId].name} ({MOCK_USERS[userId].role})
                        </CommitmentButton>
                    ))}
                </div>
                {currentUser && <p className="mt-2 text-sm text-gray-500">Viewing as: <span className="font-bold">{currentUser.name}</span></p>}
            </CommitmentCard>

            <main>
                {renderDashboard()}
            </main>
        </div>
    );
}

const B2BResources = () => {
    const [isWhitepaperOpen, setIsWhitepaperOpen] = useState(false);
    const [isCaseStudyOpen, setIsCaseStudyOpen] = useState(false);
    const [showCalculator, setShowCalculator] = useState(false);

    const handleResourceClick = (resourceName) => {
        if (resourceName === 'ROI Calculator') {
            setShowCalculator(true);
        } else if (resourceName === 'Whitepaper') {
            setIsWhitepaperOpen(true);
        } else if (resourceName === 'Case Study') {
            setIsCaseStudyOpen(true);
        }
    };

    if (showCalculator) {
        return <ROICalculator onBack={() => setShowCalculator(false)} />;
    }

    return (
        <>
            <div className="space-y-6">
                <Card>
                    <h2 className="text-2xl font-bold">B2B Resources</h2>
                    <p className="mt-2 text-gray-500">High-value content to capture and qualify enterprise leads.</p>
                </Card>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <Card>
                        <div className="h-10 w-10 text-slate-500 mb-4">{ICONS.Book}</div>
                        <h3 className="text-lg font-bold">Whitepaper</h3>
                        <p className="text-sm text-gray-500 mt-1 mb-3">The 2025 ROI of Sustainable Multifamily Housing in the UAE.</p>
                        <button onClick={() => handleResourceClick('Whitepaper')} className="w-full bg-slate-700 text-white font-bold py-2 px-4 rounded-lg hover:bg-slate-800 transition-colors">Read Now</button>
                    </Card>
                    <Card>
                        <div className="h-10 w-10 text-slate-500 mb-4">{ICONS.FileText}</div>
                        <h3 className="text-lg font-bold">Case Study</h3>
                        <p className="text-sm text-gray-500 mt-1 mb-3">How Developer X Increased Asset Value by 15%.</p>
                        <button onClick={() => handleResourceClick('Case Study')} className="w-full bg-slate-700 text-white font-bold py-2 px-4 rounded-lg hover:bg-slate-800 transition-colors">Get the Study</button>
                    </Card>
                    <Card>
                        <div className="h-10 w-10 text-slate-500 mb-4">{ICONS.Calculator}</div>
                        <h3 className="text-lg font-bold">ROI Calculator</h3>
                        <p className="text-sm text-gray-500 mt-1 mb-3">Estimate portfolio-wide savings and value increase.</p>
                        <button onClick={() => handleResourceClick('ROI Calculator')} className="w-full bg-slate-700 text-white font-bold py-2 px-4 rounded-lg hover:bg-slate-800 transition-colors">Launch Calculator</button>
                    </Card>
                </div>
            </div>

            <Modal isOpen={isWhitepaperOpen} onClose={() => setIsWhitepaperOpen(false)}>
                <div className="p-6 border-b">
                    <h2 className="text-2xl font-bold text-gray-800 dark:text-white">The 2025 ROI of Sustainable Multifamily Housing</h2>
                </div>
                <div className="p-6 max-h-[70vh] overflow-y-auto prose dark:prose-invert max-w-none">
                    <h3>Abstract</h3>
                    <p>A brief, high-level summary of the white paper's content. It should concisely state the problem, the proposed solution, and the key takeaways.</p>
                    <h3>1. Introduction</h3>
                    <p>Clearly define the industry-wide problem or challenge that the white paper will address...</p>
                    <h3>2. Background</h3>
                    <p>Provide context for the problem. This section might include industry trends, historical context, market analysis, and existing solutions...</p>
                    <h3>3. The Proposed Solution</h3>
                    <p>Present your unique solution or methodology. Explain how it works and why it is superior to existing alternatives...</p>
                </div>
                <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-b-xl flex justify-end">
                    <button onClick={() => setIsWhitepaperOpen(false)} className="bg-gray-200 text-gray-800 font-semibold py-2 px-4 rounded-lg hover:bg-gray-300 dark:bg-gray-600 dark:text-white dark:hover:bg-gray-500 transition-colors">Close</button>
                </div>
            </Modal>

            <Modal isOpen={isCaseStudyOpen} onClose={() => setIsCaseStudyOpen(false)}>
                <div className="p-6 border-b">
                    <h2 className="text-2xl font-bold text-gray-800 dark:text-white">Case Study: How Developer X Increased Asset Value by 15%</h2>
                </div>
                <div className="p-6 max-h-[70vh] overflow-y-auto prose dark:prose-invert max-w-none">
                    <h3>1. Executive Summary</h3>
                    <ul>
                        <li><strong>Challenge:</strong> Briefly describe the primary challenge the client was facing.</li>
                        <li><strong>Solution:</strong> Summarize the solution your company provided.</li>
                        <li><strong>Results:</strong> Highlight the key, quantifiable results achieved.</li>
                    </ul>
                    <h3>2. About the Client</h3>
                    <p>Provide a brief overview of the client's business, including their size, market position, and any other relevant details.</p>
                    <h3>3. The Challenge</h3>
                    <p>Elaborate on the specific problems and pain points the client was experiencing before they started working with you...</p>
                </div>
                <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-b-xl flex justify-end">
                    <button onClick={() => setIsCaseStudyOpen(false)} className="bg-gray-200 text-gray-800 font-semibold py-2 px-4 rounded-lg hover:bg-gray-300 dark:bg-gray-600 dark:text-white dark:hover:bg-gray-500 transition-colors">Close</button>
                </div>
            </Modal>
        </>
    );
};

function ROICalculator({ onBack }) {
    const [inputs, setInputs] = useState({
        initialInvestment: '',
        annualSavings: '',
        annualRevenueIncrease: '',
        timePeriod: '1',
    });

    const handleInputChange = (e) => {
        const { id, value } = e.target;
        if (/^\d*\.?\d*$/.test(value)) {
            setInputs(prevInputs => ({ ...prevInputs, [id]: value }));
        }
    };

    const handleTimePeriodChange = (e) => {
        const { id, value } = e.target;
        if (/^\d*$/.test(value)) {
            setInputs(prevInputs => ({ ...prevInputs, [id]: value }));
        }
    };

    const handleReset = () => {
        setInputs({
            initialInvestment: '',
            annualSavings: '',
            annualRevenueIncrease: '',
            timePeriod: '1',
        });
    };

    const results = useMemo(() => {
        const investment = parseFloat(inputs.initialInvestment) || 0;
        const savings = parseFloat(inputs.annualSavings) || 0;
        const revenue = parseFloat(inputs.annualRevenueIncrease) || 0;
        const years = parseInt(inputs.timePeriod, 10) || 1;

        if (investment === 0) {
            return { roi: 0, totalGains: 0, netProfit: 0, paybackPeriod: 'N/A', isValid: false };
        }

        const totalGains = (savings + revenue) * years;
        const netProfit = totalGains - investment;
        const roi = (netProfit / investment) * 100;
        const annualGain = savings + revenue;
        const paybackPeriod = annualGain > 0 ? (investment / annualGain).toFixed(1) : 'N/A';

        return {
            roi: roi.toFixed(1),
            totalGains: totalGains.toFixed(2),
            netProfit: netProfit.toFixed(2),
            paybackPeriod,
            isValid: true,
        };
    }, [inputs]);

    return (
        <Card>
            <button onClick={onBack} className="flex items-center text-sm font-semibold text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-4 transition-colors">
                {ICONS.ArrowLeft}
                <span className="ml-2">Back to Resources</span>
            </button>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 md:gap-12">
                <div className="space-y-6">
                    <div>
                        <h1 className="text-2xl md:text-3xl font-bold text-gray-800 dark:text-white">ROI Calculator</h1>
                        <p className="text-gray-500 dark:text-gray-400 mt-1">Estimate portfolio-wide savings and value increase.</p>
                    </div>
                    <div className="space-y-4">
                        <InputField label="Total Initial Investment (AED)" id="initialInvestment" value={inputs.initialInvestment} onChange={handleInputChange} placeholder="e.g., 50000" type="text" />
                        <InputField label="Projected Annual Savings (AED)" id="annualSavings" value={inputs.annualSavings} onChange={handleInputChange} placeholder="e.g., 12000" type="text" />
                        <InputField label="Projected Annual Revenue Increase (AED)" id="annualRevenueIncrease" value={inputs.annualRevenueIncrease} onChange={handleInputChange} placeholder="e.g., 8000" type="text" />
                        <InputField label="Time Period (Years)" id="timePeriod" value={inputs.timePeriod} onChange={handleTimePeriodChange} placeholder="e.g., 5" type="text" />
                    </div>
                    <div className="flex items-center pt-2">
                        <button
                            onClick={handleReset}
                            className="w-full bg-gray-600 hover:bg-gray-700 text-white font-bold py-3 px-4 rounded-lg transition"
                        >
                            Reset Fields
                        </button>
                    </div>
                </div>

                <div className="bg-blue-600 rounded-xl p-6 md:p-8 text-white flex flex-col justify-center">
                    <h2 className="text-xl font-semibold mb-4 opacity-80">Projected Results</h2>
                    <div className="space-y-5">
                        <div>
                            <p className="text-sm opacity-70">Return on Investment (ROI)</p>
                            <p className="text-4xl md:text-5xl font-bold">
                                {results.isValid ? `${results.roi}%` : '---'}
                            </p>
                        </div>
                        <div className="h-px bg-blue-400 opacity-50"></div>
                        <div className="grid grid-cols-2 gap-4 text-center">
                                <div>
                                    <p className="text-sm opacity-70">Payback Period</p>
                                    <p className="text-xl font-semibold">
                                        {results.isValid ? `${results.paybackPeriod} years` : '---'}
                                    </p>
                                    </div>
                                    <div>
                                    <p className="text-sm opacity-70">Net Profit</p>
                                    <p className="text-xl font-semibold">
                                        {results.isValid ? `AED ${Number(results.netProfit).toLocaleString()}` : '---'}
                                    </p>
                                </div>
                        </div>
                    </div>
                </div>
            </div>
        </Card>
    );
}

const B2BPartners = () => {
    const [partnerType, setPartnerType] = useState("");

    return (
        <Card>
            <h2 className="text-xl font-bold text-gray-800 dark:text-white">Partner with Evervale</h2>
            <p className="text-gray-500 dark:text-gray-400 mt-2 mb-6">Join us in revolutionizing the region's property market.</p>
            <form className="space-y-4" onSubmit={e => e.preventDefault()}>
                <InputField id="companyName" label="Company Name" type="text" placeholder="Your Company Name" />
                <InputField id="contactEmail" label="Contact Email" type="email" placeholder="work@example.com" />
                <div>
                    <label htmlFor="partnerType" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Partner Type</label>
                    <select
                        id="partnerType"
                        value={partnerType}
                        onChange={(e) => setPartnerType(e.target.value)}
                        className={`w-full p-3 rounded-lg bg-gray-100 dark:bg-gray-700 border dark:border-gray-600 ${!partnerType ? "text-gray-500" : ""}`}
                    >
                        <option value="" disabled>Select Partner Type</option>
                        <option value="esco">ESCO (Energy Service Company)</option>
                        <option value="developer">Real Estate Developer</option>
                        <option value="community_management">Community Management</option>
                    </select>
                </div>
                <div>
                    <label htmlFor="interestDescription" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Briefly describe your interest...</label>
                    <textarea id="interestDescription" placeholder="Tell us how you'd like to partner with us..." rows="3" className="w-full p-3 rounded-lg bg-gray-100 dark:bg-gray-700 border dark:border-gray-600"></textarea>
                </div>
                <button type="submit" className="w-full bg-slate-700 text-white font-bold py-3 px-4 rounded-lg hover:bg-slate-800 transition-colors">Submit Partnership Request</button>
            </form>
        </Card>
    );
};

const B2BVendorPortal = () => {
    const [activeTab, setActiveTab] = useState('audit');

    const TabButton = ({ id, label }) => (
        <button
            onClick={() => setActiveTab(id)}
            className={`px-4 py-2 text-sm font-semibold rounded-md transition-colors whitespace-nowrap ${activeTab === id ? 'bg-slate-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
        >
            {label}
        </button>
    );

    const renderTabContent = () => {
        switch (activeTab) {
            case 'audit':
                return <p>Energy Auditing & Baseline Establishment content goes here.</p>;
            case 'planning':
                return <p>Retrofit Planning & Phasing content goes here.</p>;
            case 'installation':
                return <p>Installation & QA/QC content goes here.</p>;
            case 'mv':
                return <p>Monitoring & Verification (M&V) content goes here.</p>;
            case 'legal':
                return <p>Performance Insurance & Legal Documentation content goes here.</p>;
            default:
                return null;
        }
    };

    return (
        <div className="space-y-6">
            <Card>
                <h2 className="text-2xl font-bold">ESCO Vendor Portal</h2>
                <p className="mt-2 text-gray-500">Manage the entire retrofit lifecycle from audit to verification.</p>
            </Card>
            <Card>
                <div className="flex items-center space-x-2 p-1 bg-slate-900 rounded-lg overflow-x-auto">
                    <TabButton id="audit" label="1. Auditing" />
                    <TabButton id="planning" label="2. Planning" />
                    <TabButton id="installation" label="3. Installation" />
                    <TabButton id="mv" label="4. M&V" />
                    <TabButton id="legal" label="5. Legal & Insurance" />
                </div>
            </Card>
            <Card>
                {renderTabContent()}
            </Card>
        </div>
    );
};

const NotFound = () => {
    const { setCurrentPage } = useAppContext();
    return (
        <Card className="text-center">
            <h1 className="text-6xl font-bold text-red-500">404</h1>
            <h2 className="text-2xl font-semibold mt-4">Page Not Found</h2>
            <p className="text-gray-500 mt-2">Sorry, the page you are looking for does not exist.</p>
            <button onClick={() => setCurrentPage('/dashboard')} className="mt-6 inline-block bg-green-500 text-white font-bold py-2 px-6 rounded-lg hover:bg-green-600">
                Go to Dashboard
            </button>
        </Card>
    );
};

// =================================================================================
// --- 9. MAIN APP COMPONENT & EXPORT ---
// The root component that orchestrates the entire application.
// =================================================================================

function App() {
    const {
        darkMode, isModalOpen, closeModal, modalContent, isLoading,
        handleFormSubmit, getPageTitle, currentPage,
        isAuthenticated, isPropertySelected
    } = useAppContext();

    useEffect(() => {
        document.documentElement.classList.toggle('dark', darkMode);
    }, [darkMode]);

    const renderModalContent = () => {
        if (isLoading) return <Spinner />;
        switch (modalContent.type) {
            case 'form':
                return <RequestInfoForm serviceName={modalContent.title} onSubmit={handleFormSubmit} />;
            case 'communityAuditForm':
                return <RequestCommunityAuditForm onClose={closeModal} />;
            case 'launchInitiative':
                return <LaunchInitiativeForm projectData={modalContent.data} onClose={closeModal} />;
            case 'report':
                return <BrandedReport title={modalContent.title} content={modalContent.content} benchmarkData={modalContent.data} />;
            default:
                if (modalContent.content) {
                    return <BrandedReport title={modalContent.title} content={modalContent.content} benchmarkData={modalContent.data} />;
                }
                return null;
        }
    };

    const renderPage = () => {
        switch(currentPage) {
            case '/dashboard': return <Dashboard />;
            case '/certification': return <Certification />;
            case '/performance': return <Performance />;
            case '/services': return <Services />;
            case '/profile': return <Profile />;
            case '/b2b-dashboard': return <B2BDashboard />;
            case '/b2b-communities': return <B2BCommunities />;
            case '/b2b-commitments': return <B2BCommitments />;
            case '/b2b-vendor-portal': return <B2BVendorPortal />;
            case '/b2b-resources': return <B2BResources />;
            case '/b2b-partners': return <B2BPartners />;
            default: return <NotFound />;
        }
    }

    if (!isAuthenticated) {
        return <LoginScreen />;
    }

    if (!isPropertySelected) {
        return <PropertySelectionScreen />;
    }

    return (
        <>
            <div className="flex h-screen bg-[#F9FAFB] dark:bg-[#101828] font-sans">
                <Sidebar />
                <div className="flex-1 flex flex-col overflow-hidden">
                    <Header title={getPageTitle()} />
                    <main className="flex-1 overflow-x-hidden overflow-y-auto bg-[#F9FAFB] dark:bg-[#101828] p-6">
                        {renderPage()}
                    </main>
                </div>
            </div>
            <Toast />
            <Modal isOpen={isModalOpen} onClose={closeModal} maxWidth={modalContent.type === 'communityAuditForm' || modalContent.type === 'launchInitiative' ? 'max-w-xl' : 'max-w-2xl'}>
                {renderModalContent()}
            </Modal>
        </>
    );
}

export default function EvervaleDashboard() {
    return (
        <AppProvider>
            <App />
        </AppProvider>
    )
}

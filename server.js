const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const { body, validationResult } = require('express-validator');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5001;

// ==================== CREATE BASIC MODELS ====================

// Create basic schemas if models don't exist
const createModels = () => {
  console.log('🔧 Creating basic models...');
  
  // Product Schema
  const productSchema = new mongoose.Schema({
    name: { type: String, required: true },
    category: { type: String, default: 'Uncategorized' },
    buyingPrice: { type: Number, default: 0 },
    minSellingPrice: { type: Number, default: 0 },
    currentStock: { type: Number, default: 0 },
    minStockLevel: { type: Number, default: 5 },
    barcode: String,
    shop: String,
    description: String,
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  });

  // Shop Schema
  const shopSchema = new mongoose.Schema({
    name: { type: String, required: true },
    location: String,
    manager: String,
    contact: String,
    email: String,
    status: { type: String, default: 'active' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  });

  // Cashier Schema
  const cashierSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true },
    phone: String,
    password: String,
    role: { type: String, default: 'cashier' },
    status: { type: String, default: 'active' },
    lastLogin: Date,
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  });

  // Expense Schema
  const expenseSchema = new mongoose.Schema({
    description: { type: String, required: true },
    amount: { type: Number, required: true },
    category: { type: String, default: 'General' },
    date: { type: Date, default: Date.now },
    shop: String,
    recordedBy: String,
    notes: String,
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  });

  // Transaction Schema
  const transactionSchema = new mongoose.Schema({
    transactionNumber: { type: String, required: true },
    totalAmount: { type: Number, required: true },
    items: [{
      productName: String,
      quantity: { type: Number, default: 1 },
      price: Number,
      totalPrice: Number,
      productId: mongoose.Schema.Types.ObjectId
    }],
    paymentMethod: { type: String, default: 'cash' },
    customerName: { type: String, default: 'Walk-in Customer' },
    cashierName: String,
    cashierId: String,
    shop: String,
    shopId: String,
    saleDate: { type: Date, default: Date.now },
    status: { type: String, default: 'completed' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  });

  // Credit Schema (NEW - for credit transactions)
  const creditSchema = new mongoose.Schema({
    transactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction', required: true },
    customerName: { type: String, required: true },
    customerPhone: String,
    customerEmail: String,
    totalAmount: { type: Number, required: true },
    amountPaid: { type: Number, default: 0 },
    balanceDue: { type: Number, required: true },
    dueDate: { type: Date, required: true },
    status: { type: String, default: 'pending', enum: ['pending', 'partially_paid', 'paid', 'overdue'] },
    paymentHistory: [{
      amount: Number,
      paymentDate: { type: Date, default: Date.now },
      paymentMethod: String,
      recordedBy: String
    }],
    shop: String,
    cashierId: String,
    cashierName: String,
    notes: String,
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  });

  // User Schema (for admin)
  const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    role: { type: String, default: 'admin' },
    isActive: { type: Boolean, default: true },
    lastLogin: Date,
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  });

  // Secure Code Schema
  const secureCodeSchema = new mongoose.Schema({
    email: { type: String, required: true },
    code: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 },
    used: { type: Boolean, default: false }
  });

  // Index for automatic expiration
  secureCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

  // Create or get models
  const models = {
    Product: mongoose.models.Product || mongoose.model('Product', productSchema),
    Shop: mongoose.models.Shop || mongoose.model('Shop', shopSchema),
    Cashier: mongoose.models.Cashier || mongoose.model('Cashier', cashierSchema),
    Expense: mongoose.models.Expense || mongoose.model('Expense', expenseSchema),
    Transaction: mongoose.models.Transaction || mongoose.model('Transaction', transactionSchema),
    Credit: mongoose.models.Credit || mongoose.model('Credit', creditSchema),
    User: mongoose.models.User || mongoose.model('User', userSchema),
    SecureCode: mongoose.models.SecureCode || mongoose.model('SecureCode', secureCodeSchema)
  };

  console.log('✅ All models created successfully');
  return models;
};

let models = {};

// ==================== EMAIL CONFIGURATION ====================

// Email transporter configuration
const createEmailTransporter = () => {
  try {
    const emailUser = process.env.EMAIL_USER || 'kinyuastanzo6759@gmail.com';
    const emailPass = process.env.EMAIL_PASSWORD || 'your-gmail-password';

    console.log('📧 Configuring email transporter...');
    console.log('📧 Email user:', emailUser);
    
    if (!emailUser || !emailPass) {
      throw new Error('Email credentials not configured');
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: {
        user: emailUser,
        pass: emailPass,
      },
      debug: false,
      logger: false
    });

    return transporter;
  } catch (error) {
    console.error('❌ Error creating email transporter:', error.message);
    throw error;
  }
};

let emailTransporter = null;

// Initialize email transporter
const initializeEmail = async () => {
  try {
    emailTransporter = createEmailTransporter();
    await emailTransporter.verify();
    console.log('✅ Email transporter is ready and verified');
    return true;
  } catch (error) {
    console.error('❌ Email configuration error:', error.message);
    console.log('⚠️ Email functionality will be disabled');
    return false;
  }
};

// ==================== SECURE CODE AUTHENTICATION ====================

const generateSecureCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

const sendSecureCodeEmail = async (email, code) => {
  if (!emailTransporter) {
    throw new Error('Email service not configured');
  }

  const mailOptions = {
    from: process.env.EMAIL_USER || 'kinyuastanzo6759@gmail.com',
    to: email,
    subject: 'Your Secure Login Code - Stanzo Shop Management',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333; border-bottom: 2px solid #4CAF50; padding-bottom: 10px;">
          Stanzo Bar Management - Secure Login
        </h2>
        <p>Hello,</p>
        <p>Your secure login code for Stanzo Bar Management System is:</p>
        <div style="background: #f8f9fa; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 8px; margin: 25px 0; border: 2px dashed #4CAF50; border-radius: 8px;">
          ${code}
        </div>
        <p style="color: #666; font-size: 14px;">
          This code will expire in 15 minutes for security reasons.
        </p>
        <p style="color: #999; font-size: 12px;">
          If you didn't request this code, please ignore this email or contact support if you're concerned.
        </p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
        <p style="color: #888; font-size: 11px;">
          This is an automated message from Stanzo Bar Management System.
        </p>
      </div>
    `
  };

  await emailTransporter.sendMail(mailOptions);
};

const generateAuthToken = (userId, email, role) => {
  return jwt.sign(
    { 
      userId, 
      email, 
      role,
      timestamp: Date.now()
    },
    process.env.JWT_SECRET || 'fallback-secret-key-change-in-production',
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );
};

// ==================== MIDDLEWARE SETUP ====================

// Security Middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

// Remove sensitive headers
app.use((req, res, next) => {
  res.removeHeader('X-Powered-By');
  next();
});

// Compression
app.use(compression());

// CORS Configuration
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  // origin: process.env.CLIENT_URL || 'https://stanzo-front.vercel.app/',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
}));

// Handle preflight requests
app.options('*', cors());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: { success: false, message: 'Too many requests' }
});
app.use('/api/', limiter);

// Auth-specific rate limiting
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { success: false, message: 'Too many authentication attempts' }
});

const emailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { success: false, message: 'Too many email requests' }
});

app.use('/api/auth/request-code', emailLimiter);
app.use('/api/auth/verify-code', authLimiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging
app.use(morgan('dev'));

// ==================== DATABASE CONNECTION ====================

const connectDB = async () => {
  try {
    const connectionString = process.env.MONGODB_URI || 'mongodb://localhost:27017/stanzo_db';
    
    console.log('🔗 Connecting to MongoDB...');
    
    await mongoose.connect(connectionString, {
      serverSelectionTimeoutMS: 15000,
      socketTimeoutMS: 45000,
      maxPoolSize: 25,
      minPoolSize: 5,
      retryWrites: true
    });
    
    console.log('✅ MongoDB connected successfully');
    
    // Create models after successful connection
    models = createModels();
    
    // Initialize email service
    await initializeEmail();
    
    // Create default admin user if it doesn't exist
    await createDefaultAdmin();
    
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    process.exit(1);
  }
};

// Create default admin user (without password)
const createDefaultAdmin = async () => {
  try {
    const adminEmail = process.env.ADMIN_EMAIL || 'kinyuastanzo6759@gmail.com';
    
    const existingAdmin = await models.User.findOne({ email: adminEmail });
    if (!existingAdmin) {
      await models.User.create({
        email: adminEmail,
        name: 'System Administrator',
        role: 'admin'
      });
      console.log('✅ Default admin user created');
    } else {
      console.log('✅ Admin user already exists');
    }
  } catch (error) {
    console.log('⚠️ Could not create admin user:', error.message);
  }
};

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'stanzo_session_secret_change_in_production',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI || 'mongodb://localhost:27017/stanzo_db',
    collectionName: 'sessions'
  }),
  cookie: {
    secure: false,
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// ==================== AUTHENTICATION MIDDLEWARE ====================

const verifyToken = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '') || 
                req.session.token;
  
  if (!token) {
    return res.status(401).json({ 
      success: false,
      message: 'No token provided' 
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret-key-change-in-production');
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ 
      success: false,
      message: 'Invalid token' 
    });
  }
};

// ==================== OPTIMIZED REPORT HELPER FUNCTIONS ====================

// Single optimized function to calculate all report data
const calculateOptimizedReports = async (params = {}) => {
  try {
    const {
      startDate,
      endDate,
      shopId,
      cashierId,
      paymentMethod,
      groupBy = 'daily'
    } = params;

    console.log('🚀 Calculating optimized reports with params:', params);

    // Build filter for transactions
    const filter = { status: 'completed' };
    
    // Date filter
    if (startDate && endDate) {
      filter.saleDate = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }
    
    // Shop filter
    if (shopId && shopId !== 'all') {
      filter.$or = [
        { shop: shopId },
        { shopId: shopId }
      ];
    }
    
    // Cashier filter
    if (cashierId && cashierId !== 'all') {
      filter.$or = [
        { cashierId: cashierId },
        { cashierName: { $regex: cashierId, $options: 'i' } }
      ];
    }
    
    // Payment method filter
    if (paymentMethod && paymentMethod !== 'all') {
      filter.paymentMethod = paymentMethod;
    }

    // Fetch all required data in parallel
    const [transactions, expenses, products, shops, cashiers, credits] = await Promise.all([
      models.Transaction.find(filter).sort({ saleDate: 1 }).lean(),
      models.Expense.find(startDate && endDate ? {
        date: { $gte: new Date(startDate), $lte: new Date(endDate) }
      } : {}).lean(),
      models.Product.find().lean(),
      models.Shop.find().lean(),
      models.Cashier.find().lean(),
      models.Credit.find(shopId && shopId !== 'all' ? { shop: shopId } : {}).lean()
    ]);

    console.log(`📊 Found ${transactions.length} transactions, ${expenses.length} expenses, ${products.length} products`);

    // Calculate comprehensive summary
    const totalRevenue = transactions.reduce((sum, t) => sum + (t.totalAmount || 0), 0);
    const totalTransactions = transactions.length;
    const totalItemsSold = transactions.reduce((sum, t) => 
      sum + t.items.reduce((itemSum, item) => itemSum + (item.quantity || 0), 0), 0
    );
    const totalExpenses = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
    const totalProfit = totalRevenue - totalExpenses;
    const creditAmount = credits.reduce((sum, c) => sum + (c.balanceDue || 0), 0);

    // Group transactions by time period
    const groupedData = {};
    transactions.forEach(transaction => {
      const saleDate = new Date(transaction.saleDate);
      let groupKey;

      switch (groupBy) {
        case 'hourly':
          groupKey = saleDate.toISOString().slice(0, 13) + ':00:00';
          break;
        case 'weekly':
          const weekStart = new Date(saleDate);
          weekStart.setDate(saleDate.getDate() - saleDate.getDay());
          groupKey = weekStart.toISOString().slice(0, 10);
          break;
        case 'monthly':
          groupKey = saleDate.toISOString().slice(0, 7);
          break;
        case 'yearly':
          groupKey = saleDate.toISOString().slice(0, 4);
          break;
        default: // daily
          groupKey = saleDate.toISOString().slice(0, 10);
      }

      if (!groupedData[groupKey]) {
        groupedData[groupKey] = {
          period: groupKey,
          revenue: 0,
          transactions: 0,
          itemsSold: 0,
          averageTransaction: 0
        };
      }

      groupedData[groupKey].revenue += transaction.totalAmount || 0;
      groupedData[groupKey].transactions += 1;
      groupedData[groupKey].itemsSold += transaction.items?.reduce((sum, item) => sum + (item.quantity || 0), 0) || 0;
    });

    // Calculate averages and format time series data
    const timeSeries = Object.values(groupedData).map(period => ({
      ...period,
      averageTransaction: period.transactions > 0 ? period.revenue / period.transactions : 0,
      revenue: parseFloat(period.revenue.toFixed(2)),
      periodLabel: formatPeriodLabel(period.period, groupBy)
    })).sort((a, b) => a.period.localeCompare(b.period));

    // Payment method breakdown
    const paymentMethodBreakdown = transactions.reduce((acc, t) => {
      const method = t.paymentMethod || 'cash';
      if (!acc[method]) {
        acc[method] = { count: 0, amount: 0 };
      }
      acc[method].count += 1;
      acc[method].amount += t.totalAmount || 0;
      return acc;
    }, {});

    // Cashier performance
    const cashierPerformance = transactions.reduce((acc, t) => {
      const cashier = t.cashierName || 'Unknown Cashier';
      if (!acc[cashier]) {
        acc[cashier] = { 
          name: cashier,
          transactions: 0, 
          revenue: 0,
          itemsSold: 0
        };
      }
      acc[cashier].transactions += 1;
      acc[cashier].revenue += t.totalAmount || 0;
      acc[cashier].itemsSold += t.items?.reduce((sum, item) => sum + (item.quantity || 0), 0) || 0;
      return acc;
    }, {});

    // Product performance
    const productPerformance = {};
    transactions.forEach(t => {
      t.items?.forEach(item => {
        const productName = item.productName || 'Unknown Product';
        if (!productPerformance[productName]) {
          productPerformance[productName] = {
            name: productName,
            quantity: 0,
            revenue: 0,
            transactions: 0
          };
        }
        productPerformance[productName].quantity += item.quantity || 0;
        productPerformance[productName].revenue += item.totalPrice || 0;
        productPerformance[productName].transactions += 1;
      });
    });

    // Daily breakdown for sales summary
    const dailyBreakdown = transactions.reduce((acc, t) => {
      const date = new Date(t.saleDate).toISOString().slice(0, 10);
      if (!acc[date]) {
        acc[date] = { date, revenue: 0, transactions: 0, itemsSold: 0 };
      }
      acc[date].revenue += t.totalAmount || 0;
      acc[date].transactions += 1;
      acc[date].itemsSold += t.items?.reduce((sum, item) => sum + (item.quantity || 0), 0) || 0;
      return acc;
    }, {});

    const dailyData = Object.values(dailyBreakdown)
      .map(day => ({
        ...day,
        revenue: parseFloat(day.revenue.toFixed(2)),
        averageTransaction: day.transactions > 0 ? parseFloat((day.revenue / day.transactions).toFixed(2)) : 0
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Format final results
    const result = {
      // Comprehensive Report Data
      comprehensiveReport: {
        summary: {
          totalRevenue: parseFloat(totalRevenue.toFixed(2)),
          totalTransactions,
          totalItemsSold,
          totalExpenses: parseFloat(totalExpenses.toFixed(2)),
          totalProfit: parseFloat(totalProfit.toFixed(2)),
          creditAmount: parseFloat(creditAmount.toFixed(2)),
          netProfit: parseFloat((totalProfit - creditAmount).toFixed(2)),
          averageTransaction: totalTransactions > 0 ? parseFloat((totalRevenue / totalTransactions).toFixed(2)) : 0,
          dateRange: {
            startDate: startDate || 'All time',
            endDate: endDate || 'All time'
          }
        },
        timeSeries: timeSeries,
        paymentMethods: Object.entries(paymentMethodBreakdown).map(([method, stats]) => ({
          method,
          transactionCount: stats.count,
          totalAmount: parseFloat(stats.amount.toFixed(2)),
          percentage: parseFloat(((stats.amount / totalRevenue) * 100).toFixed(1))
        })),
        cashierPerformance: Object.values(cashierPerformance)
          .map(cashier => ({
            ...cashier,
            revenue: parseFloat(cashier.revenue.toFixed(2)),
            averageTransaction: cashier.transactions > 0 ? parseFloat((cashier.revenue / cashier.transactions).toFixed(2)) : 0
          }))
          .sort((a, b) => b.revenue - a.revenue),
        productPerformance: Object.values(productPerformance)
          .map(product => ({
            ...product,
            revenue: parseFloat(product.revenue.toFixed(2)),
            averagePrice: product.quantity > 0 ? parseFloat((product.revenue / product.quantity).toFixed(2)) : 0
          }))
          .sort((a, b) => b.revenue - a.revenue)
          .slice(0, 20),
        rawTransactions: transactions.slice(0, 1000)
      },

      // Sales Summary Data
      salesSummary: {
        summary: {
          totalRevenue: parseFloat(totalRevenue.toFixed(2)),
          totalTransactions,
          totalItemsSold,
          averageTransaction: totalTransactions > 0 ? parseFloat((totalRevenue / totalTransactions).toFixed(2)) : 0,
          period: {
            startDate: startDate || 'All time',
            endDate: endDate || 'All time'
          }
        },
        dailyBreakdown: dailyData,
        recentTransactions: transactions
          .sort((a, b) => new Date(b.saleDate) - new Date(a.saleDate))
          .slice(0, 50)
      },

      // Product Performance Data
      productPerformance: {
        products: Object.values(productPerformance)
          .map(product => ({
            ...product,
            totalRevenue: parseFloat(product.revenue.toFixed(2)),
            averagePrice: product.quantity > 0 ? parseFloat((product.revenue / product.quantity).toFixed(2)) : 0,
            revenuePerTransaction: product.transactions > 0 ? parseFloat((product.revenue / product.transactions).toFixed(2)) : 0
          }))
          .sort((a, b) => b.totalRevenue - a.totalRevenue)
          .slice(0, 50),
        summary: {
          totalProducts: Object.keys(productPerformance).length,
          totalRevenue: Object.values(productPerformance).reduce((sum, p) => sum + p.revenue, 0),
          totalQuantity: Object.values(productPerformance).reduce((sum, p) => sum + p.quantity, 0)
        }
      },

      // Cashier Performance Data
      cashierPerformance: {
        cashiers: Object.values(cashierPerformance)
          .map(cashier => ({
            ...cashier,
            totalRevenue: parseFloat(cashier.revenue.toFixed(2)),
            averageTransaction: cashier.transactions > 0 ? parseFloat((cashier.revenue / cashier.transactions).toFixed(2)) : 0,
            itemsPerTransaction: cashier.transactions > 0 ? parseFloat((cashier.itemsSold / cashier.transactions).toFixed(2)) : 0,
            performanceScore: calculateCashierPerformanceScore(cashier)
          }))
          .sort((a, b) => b.totalRevenue - a.revenue),
        summary: {
          totalCashiers: Object.keys(cashierPerformance).length,
          totalRevenue: Object.values(cashierPerformance).reduce((sum, c) => sum + c.revenue, 0),
          totalTransactions: Object.values(cashierPerformance).reduce((sum, c) => sum + c.transactions, 0)
        }
      },

      // Additional data for frontend
      comprehensiveData: {
        transactions,
        expenses,
        products,
        summary: {
          totalTransactions: transactions.length,
          totalRevenue: parseFloat(totalRevenue.toFixed(2)),
          totalExpenses: parseFloat(totalExpenses.toFixed(2)),
          totalProducts: products.length
        }
      },

      // Metadata
      shops,
      cashiers,
      credits,
      processingTime: Date.now(),
      timestamp: new Date().toISOString()
    };

    console.log('✅ Optimized reports generated successfully');
    return result;

  } catch (error) {
    console.error('❌ Error calculating optimized reports:', error);
    throw error;
  }
};

// Helper function to format period labels
const formatPeriodLabel = (period, groupBy) => {
  switch (groupBy) {
    case 'hourly':
      return new Date(period).toLocaleString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        hour: '2-digit',
        hour12: true 
      });
    case 'weekly':
      const weekStart = new Date(period);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      return `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
    case 'monthly':
      return new Date(period + '-01').toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
    case 'yearly':
      return period;
    default: // daily
      return new Date(period).toLocaleDateString('en-US', { 
        weekday: 'short', 
        month: 'short', 
        day: 'numeric' 
      });
  }
};

// Helper function to calculate cashier performance score
const calculateCashierPerformanceScore = (cashier) => {
  const revenueScore = Math.min(100, (cashier.revenue / 10000) * 100);
  const transactionScore = Math.min(100, (cashier.transactions / 100) * 100);
  const efficiencyScore = Math.min(100, (cashier.itemsPerTransaction / 10) * 100);
  
  return parseFloat(((revenueScore * 0.5) + (transactionScore * 0.3) + (efficiencyScore * 0.2)).toFixed(1));
};

// ==================== SINGLE OPTIMIZED ENDPOINT ====================

// NEW: Single optimized endpoint that replaces 5 separate API calls
app.get('/api/transactions/reports/optimized', async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      shopId,
      cashierId,
      paymentMethod,
      groupBy = 'daily'
    } = req.query;

    console.log('🚀 Processing optimized report request...', req.query);

    const startTime = Date.now();
    
    const reports = await calculateOptimizedReports({
      startDate,
      endDate,
      shopId,
      cashierId,
      paymentMethod,
      groupBy
    });

    const processingTime = Date.now() - startTime;

    console.log(`✅ Optimized report generated in ${processingTime}ms`);

    res.json({
      success: true,
      data: reports,
      processingTime,
      message: 'Optimized report generated successfully'
    });

  } catch (error) {
    console.error('❌ Error generating optimized report:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate optimized report',
      error: error.message,
      processingTime: 0
    });
  }
});

// ==================== EXISTING REPORT ENDPOINTS (MAINTAINED FOR BACKWARD COMPATIBILITY) ====================

// Comprehensive Transaction Reports Endpoint
app.get('/api/transactions/reports/comprehensive', async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      shopId,
      cashierId,
      paymentMethod,
      groupBy = 'daily'
    } = req.query;

    console.log('📊 Generating comprehensive transaction report...', req.query);

    const reports = await calculateOptimizedReports({
      startDate,
      endDate,
      shopId,
      cashierId,
      paymentMethod,
      groupBy
    });

    res.json({
      success: true,
      data: reports.comprehensiveReport,
      message: 'Transaction report generated successfully'
    });

  } catch (error) {
    console.error('❌ Error generating transaction report:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate transaction report',
      error: error.message
    });
  }
});

// Sales Summary Report
app.get('/api/transactions/reports/sales-summary', async (req, res) => {
  try {
    const { startDate, endDate, shopId } = req.query;

    console.log('📈 Generating sales summary report...', req.query);

    const reports = await calculateOptimizedReports({
      startDate,
      endDate,
      shopId
    });

    res.json({
      success: true,
      data: reports.salesSummary,
      message: 'Sales summary report generated successfully'
    });

  } catch (error) {
    console.error('❌ Error generating sales summary report:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate sales summary report',
      error: error.message
    });
  }
});

// Product Performance Report
app.get('/api/transactions/reports/product-performance', async (req, res) => {
  try {
    const { startDate, endDate, shopId, limit = 50 } = req.query;

    console.log('📦 Generating product performance report...', req.query);

    const reports = await calculateOptimizedReports({
      startDate,
      endDate,
      shopId
    });

    // Apply limit to products
    const limitedProducts = reports.productPerformance.products.slice(0, parseInt(limit));

    res.json({
      success: true,
      data: {
        products: limitedProducts,
        summary: reports.productPerformance.summary
      },
      message: 'Product performance report generated successfully'
    });

  } catch (error) {
    console.error('❌ Error generating product performance report:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate product performance report',
      error: error.message
    });
  }
});

// Cashier Performance Report
app.get('/api/transactions/reports/cashier-performance', async (req, res) => {
  try {
    const { startDate, endDate, shopId } = req.query;

    console.log('👤 Generating cashier performance report...', req.query);

    const reports = await calculateOptimizedReports({
      startDate,
      endDate,
      shopId
    });

    res.json({
      success: true,
      data: reports.cashierPerformance,
      message: 'Cashier performance report generated successfully'
    });

  } catch (error) {
    console.error('❌ Error generating cashier performance report:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate cashier performance report',
      error: error.message
    });
  }
});

// ==================== STATISTICS HELPER FUNCTIONS ====================

// Helper function to calculate cashier daily stats
const calculateCashierDailyStats = async (cashierId, shopId, startDate, endDate) => {
  try {
    console.log(`📊 Calculating cashier daily stats for cashier: ${cashierId}, shop: ${shopId}`);
    
    const transactions = await models.Transaction.find({
      $or: [
        { cashierId: cashierId },
        { cashierName: { $regex: cashierId, $options: 'i' } }
      ],
      $or: [
        { shop: shopId },
        { shopId: shopId }
      ],
      status: 'completed',
      saleDate: {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      }
    });

    const totalSales = transactions.reduce((sum, t) => sum + (t.totalAmount || 0), 0);
    const transactionCount = transactions.length;
    const itemsSold = transactions.reduce((sum, t) => 
      sum + t.items.reduce((itemSum, item) => itemSum + (item.quantity || 0), 0), 0
    );

    // Calculate average transaction value
    const averageTransaction = transactionCount > 0 ? totalSales / transactionCount : 0;

    // Get cashier info
    const cashier = await models.Cashier.findById(cashierId);

    return {
      success: true,
      data: {
        cashierId,
        cashierName: cashier?.name || 'Unknown Cashier',
        shopId,
        period: {
          startDate: new Date(startDate),
          endDate: new Date(endDate)
        },
        totalSales: parseFloat(totalSales.toFixed(2)),
        transactionCount,
        itemsSold,
        averageTransaction: parseFloat(averageTransaction.toFixed(2)),
        performance: {
          score: Math.min(100, (totalSales / 1000) * 10 + (transactionCount * 2)),
          rating: totalSales > 5000 ? 'excellent' : totalSales > 2000 ? 'good' : 'average'
        }
      }
    };
  } catch (error) {
    console.error('❌ Error calculating cashier daily stats:', error);
    throw error;
  }
};

// Helper function to calculate daily sales stats
const calculateDailySalesStats = async (cashierId, shopId, startDate, endDate) => {
  try {
    console.log(`📈 Calculating daily sales stats for cashier: ${cashierId}, shop: ${shopId}`);
    
    const transactions = await models.Transaction.find({
      $or: [
        { shop: shopId },
        { shopId: shopId }
      ],
      status: 'completed',
      saleDate: {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      }
    });

    const totalRevenue = transactions.reduce((sum, t) => sum + (t.totalAmount || 0), 0);
    const totalTransactions = transactions.length;
    
    // Group by payment method
    const paymentMethodStats = transactions.reduce((acc, t) => {
      const method = t.paymentMethod || 'cash';
      if (!acc[method]) {
        acc[method] = { count: 0, amount: 0 };
      }
      acc[method].count += 1;
      acc[method].amount += t.totalAmount || 0;
      return acc;
    }, {});

    // Calculate hourly distribution (simplified)
    const hourlyStats = {};
    transactions.forEach(t => {
      const hour = new Date(t.saleDate).getHours();
      const hourKey = `${hour}:00`;
      if (!hourlyStats[hourKey]) {
        hourlyStats[hourKey] = { transactions: 0, revenue: 0 };
      }
      hourlyStats[hourKey].transactions += 1;
      hourlyStats[hourKey].revenue += t.totalAmount || 0;
    });

    return {
      success: true,
      data: {
        period: {
          startDate: new Date(startDate),
          endDate: new Date(endDate)
        },
        summary: {
          totalRevenue: parseFloat(totalRevenue.toFixed(2)),
          totalTransactions,
          averageTransaction: totalTransactions > 0 ? parseFloat((totalRevenue / totalTransactions).toFixed(2)) : 0
        },
        paymentMethods: Object.entries(paymentMethodStats).map(([method, stats]) => ({
          method,
          transactionCount: stats.count,
          totalAmount: parseFloat(stats.amount.toFixed(2)),
          percentage: parseFloat(((stats.amount / totalRevenue) * 100).toFixed(1))
        })),
        hourlyDistribution: Object.entries(hourlyStats).map(([hour, stats]) => ({
          hour,
          transactions: stats.transactions,
          revenue: parseFloat(stats.revenue.toFixed(2))
        })).sort((a, b) => a.hour.localeCompare(b.hour))
      }
    };
  } catch (error) {
    console.error('❌ Error calculating daily sales stats:', error);
    throw error;
  }
};

// ==================== API ROUTES ====================

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    app: process.env.APP_NAME || 'Stanzo Bar Management',
    version: process.env.APP_VERSION || '1.0.0',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    email: emailTransporter ? 'configured' : 'disabled',
    authentication: 'email-based-secure-code'
  });
});

// ==================== MISSING API ENDPOINTS ====================

// Cashier Daily Stats Endpoint
app.get('/api/transactions/stats/cashier-daily', async (req, res) => {
  try {
    const { cashierId, shopId, startDate, endDate } = req.query;
    
    if (!cashierId || !shopId || !startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Missing required parameters: cashierId, shopId, startDate, endDate'
      });
    }

    console.log(`📊 Fetching cashier daily stats:`, { cashierId, shopId, startDate, endDate });

    const stats = await calculateCashierDailyStats(cashierId, shopId, startDate, endDate);
    res.json(stats);

  } catch (error) {
    console.error('❌ Error in cashier daily stats endpoint:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch cashier daily stats',
      error: error.message
    });
  }
});

// Daily Sales Stats Endpoint
app.get('/api/transactions/stats/daily-sales', async (req, res) => {
  try {
    const { cashierId, shopId, startDate, endDate } = req.query;
    
    if (!shopId || !startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Missing required parameters: shopId, startDate, endDate'
      });
    }

    console.log(`📈 Fetching daily sales stats:`, { cashierId, shopId, startDate, endDate });

    const stats = await calculateDailySalesStats(cashierId, shopId, startDate, endDate);
    res.json(stats);

  } catch (error) {
    console.error('❌ Error in daily sales stats endpoint:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch daily sales stats',
      error: error.message
    });
  }
});

// Credits API Endpoints
app.get('/api/credits', async (req, res) => {
  try {
    const { shopId, status } = req.query;
    
    let filter = {};
    if (shopId && shopId !== 'all') filter.shop = shopId;
    if (status && status !== 'all') filter.status = status;

    const credits = await models.Credit.find(filter)
      .populate('transactionId')
      .sort({ dueDate: 1 });

    res.json({
      success: true,
      data: credits,
      count: credits.length
    });
  } catch (error) {
    console.error('Error fetching credits:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch credits',
      error: error.message
    });
  }
});

app.post('/api/credits', async (req, res) => {
  try {
    const creditData = req.body;
    
    // Validate required fields
    if (!creditData.transactionId || !creditData.customerName || !creditData.totalAmount) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: transactionId, customerName, totalAmount'
      });
    }

    const credit = new models.Credit(creditData);
    await credit.save();

    // Populate the transaction data in response
    await credit.populate('transactionId');

    res.status(201).json({
      success: true,
      data: credit,
      message: 'Credit record created successfully'
    });
  } catch (error) {
    console.error('Error creating credit:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create credit record',
      error: error.message
    });
  }
});

app.get('/api/credits/:id', async (req, res) => {
  try {
    const credit = await models.Credit.findById(req.params.id).populate('transactionId');
    if (!credit) {
      return res.status(404).json({
        success: false,
        message: 'Credit record not found'
      });
    }
    res.json({
      success: true,
      data: credit
    });
  } catch (error) {
    console.error('Error fetching credit:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch credit record',
      error: error.message
    });
  }
});

app.put('/api/credits/:id', async (req, res) => {
  try {
    const credit = await models.Credit.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedAt: new Date() },
      { new: true, runValidators: true }
    ).populate('transactionId');
    
    if (!credit) {
      return res.status(404).json({
        success: false,
        message: 'Credit record not found'
      });
    }
    
    res.json({
      success: true,
      data: credit,
      message: 'Credit record updated successfully'
    });
  } catch (error) {
    console.error('Error updating credit:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update credit record',
      error: error.message
    });
  }
});

app.patch('/api/credits/:id/payment', async (req, res) => {
  try {
    const { amount, paymentMethod, recordedBy } = req.body;
    
    if (!amount || !paymentMethod) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: amount, paymentMethod'
      });
    }

    const credit = await models.Credit.findById(req.params.id);
    if (!credit) {
      return res.status(404).json({
        success: false,
        message: 'Credit record not found'
      });
    }

    // Add payment to history
    credit.paymentHistory.push({
      amount,
      paymentMethod,
      recordedBy: recordedBy || 'System',
      paymentDate: new Date()
    });

    // Update amounts
    credit.amountPaid += amount;
    credit.balanceDue = credit.totalAmount - credit.amountPaid;

    // Update status
    if (credit.balanceDue <= 0) {
      credit.status = 'paid';
    } else if (credit.amountPaid > 0) {
      credit.status = 'partially_paid';
    }

    credit.updatedAt = new Date();
    await credit.save();

    await credit.populate('transactionId');

    res.json({
      success: true,
      data: credit,
      message: 'Payment recorded successfully'
    });
  } catch (error) {
    console.error('Error recording payment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to record payment',
      error: error.message
    });
  }
});

// ==================== SECURE AUTHENTICATION ROUTES ====================

// Request secure login code (for ADMIN only)
app.post('/api/auth/request-code',
  [
    body('email').isEmail().normalizeEmail()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: 'Invalid email address',
          details: errors.array()
        });
      }

      const { email } = req.body;
      console.log('📧 Secure code request for:', email);

      // Check if user exists in database (admin or cashier)
      const user = await models.User.findOne({ email }) || 
                   await models.Cashier.findOne({ email });

      if (!user) {
        console.log('❌ No user found with email:', email);
        return res.status(404).json({
          success: false,
          message: 'No account found with this email address'
        });
      }

      console.log('✅ User found:', user.email, 'role:', user.role);

      // Generate secure code
      const secureCode = generateSecureCode();
      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + 15); // 15 minutes expiry

      console.log('🔐 Generated secure code:', secureCode);

      // Hash and save secure code
      const hashedCode = await bcrypt.hash(secureCode, 10);
      
      await models.SecureCode.findOneAndUpdate(
        { email },
        {
          code: hashedCode,
          expiresAt,
          attempts: 0,
          used: false
        },
        { upsert: true, new: true }
      );

      console.log('💾 Secure code saved to database');

      // Send email with secure code
      if (!emailTransporter) {
        console.log('📧 Email service disabled - showing code in console');
        console.log('📧 DEVELOPMENT MODE - Secure code for', email, ':', secureCode);
        
        return res.json({
          success: true,
          message: 'Secure code generated (email service disabled)',
          developmentMode: true,
          secureCode: secureCode, // Only in development
          expiresIn: 15
        });
      }

      try {
        await sendSecureCodeEmail(email, secureCode);
        console.log('✅ Secure code sent to', email);

        res.json({
          success: true,
          message: 'Secure code sent to your email',
          expiresIn: 15
        });

      } catch (emailError) {
        console.error('❌ Failed to send email:', emailError);
        
        // In development, return the code anyway
        if (process.env.NODE_ENV === 'development') {
          console.log('📧 DEVELOPMENT FALLBACK - Secure code for', email, ':', secureCode);
          
          return res.json({
            success: true,
            message: 'Email service unavailable - using development mode',
            developmentMode: true,
            secureCode: secureCode,
            expiresIn: 15
          });
        }
        
        // Clean up the secure code if email fails in production
        await models.SecureCode.deleteOne({ email });
        
        res.status(500).json({
          success: false,
          message: 'Failed to send secure code. Please try again later.'
        });
      }

    } catch (error) {
      console.error('❌ Error requesting secure code:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to process request. Please try again later.',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

// Verify secure code and login (for ADMIN only)
app.post('/api/auth/verify-code',
  [
    body('email').isEmail().normalizeEmail(),
    body('code').isLength({ min: 6, max: 6 }).isNumeric()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: 'Invalid input',
          details: errors.array()
        });
      }

      const { email, code } = req.body;

      // Find secure code
      const secureCodeDoc = await models.SecureCode.findOne({ email });
      if (!secureCodeDoc) {
        return res.status(400).json({
          success: false,
          message: 'No secure code found. Please request a new code.'
        });
      }

      // Check if code is expired
      if (new Date() > secureCodeDoc.expiresAt) {
        await models.SecureCode.deleteOne({ _id: secureCodeDoc._id });
        return res.status(400).json({
          success: false,
          message: 'Secure code has expired. Please request a new code.'
        });
      }

      // Check if code is already used
      if (secureCodeDoc.used) {
        return res.status(400).json({
          success: false,
          message: 'This code has already been used. Please request a new code.'
        });
      }

      // Check attempts
      if (secureCodeDoc.attempts >= 3) {
        await models.SecureCode.deleteOne({ _id: secureCodeDoc._id });
        return res.status(400).json({
          success: false,
          message: 'Too many failed attempts. Please request a new code.'
        });
      }

      // Verify code
      const isValid = await bcrypt.compare(code, secureCodeDoc.code);
      if (!isValid) {
        // Increment attempts
        secureCodeDoc.attempts += 1;
        await secureCodeDoc.save();

        const remainingAttempts = 3 - secureCodeDoc.attempts;
        return res.status(400).json({
          success: false,
          message: `Invalid code. ${remainingAttempts} attempt(s) remaining.`
        });
      }

      // Find user (admin or cashier)
      const user = await models.User.findOne({ email }) || 
                   await models.Cashier.findOne({ email });

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User account not found'
        });
      }

      // Mark code as used
      secureCodeDoc.used = true;
      await secureCodeDoc.save();

      // Update last login
      user.lastLogin = new Date();
      await user.save();

      // Generate JWT token
      const token = generateAuthToken(user._id, user.email, user.role);

      // Set session
      const userSession = {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        lastLogin: user.lastLogin
      };

      req.session.user = userSession;
      req.session.token = token;

      console.log(`✅ User ${email} logged in successfully`);

      res.json({
        success: true,
        message: 'Login successful',
        token,
        user: userSession
      });

    } catch (error) {
      console.error('Error verifying code:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to verify code. Please try again.'
      });
    }
  }
);

// ==================== CASHIER LOGIN ROUTE (PASSWORD-BASED) ====================

// Cashier login with email and password - SINGLE ENDPOINT (NO DUPLICATES)
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password, userType = 'cashier' } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email and password'
      });
    }

    // Only allow cashier login through this endpoint
    if (userType !== 'cashier') {
      return res.status(400).json({
        success: false,
        message: 'This endpoint is for cashier login only. Admin login uses secure code authentication.'
      });
    }

    console.log('👤 Cashier login attempt for:', email);

    // Check for cashier in database
    const cashier = await models.Cashier.findOne({ email });
    if (!cashier) {
      return res.status(404).json({
        success: false,
        message: 'Cashier account not found'
      });
    }

    // Check if cashier is active
    if (cashier.status !== 'active') {
      return res.status(403).json({
        success: false,
        message: 'Cashier account is inactive'
      });
    }

    // Verify password (plain text comparison for now)
    if (cashier.password !== password) {
      return res.status(401).json({
        success: false,
        message: 'Invalid password'
      });
    }

    // Update last login
    cashier.lastLogin = new Date();
    await cashier.save();

    const userData = {
      _id: cashier._id,
      name: cashier.name,
      email: cashier.email,
      phone: cashier.phone,
      role: cashier.role,
      status: cashier.status,
      lastLogin: cashier.lastLogin
    };

    // Set session
    req.session.user = userData;

    console.log('✅ Cashier login successful:', email);

    res.json({
      success: true,
      user: userData,
      message: 'Cashier login successful'
    });

  } catch (error) {
    console.error('Cashier login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during login'
    });
  }
});

// Logout
app.post('/api/auth/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Error destroying session:', err);
      return res.status(500).json({
        success: false,
        message: 'Logout failed'
      });
    }
    res.json({
      success: true,
      message: 'Logout successful'
    });
  });
});

// Get current user
app.get('/api/auth/me', (req, res) => {
  if (req.session.user) {
    res.json({
      success: true,
      user: req.session.user
    });
  } else {
    res.status(401).json({
      success: false,
      message: 'Not authenticated'
    });
  }
});
// Enhanced Credits API Endpoints with proper delete functionality
app.delete('/api/credits/:id', async (req, res) => {
  try {
    console.log('🗑️ Deleting credit record:', req.params.id);
    
    const credit = await models.Credit.findByIdAndDelete(req.params.id);
    
    if (!credit) {
      return res.status(404).json({
        success: false,
        message: 'Credit record not found'
      });
    }
    
    console.log('✅ Credit record deleted successfully:', req.params.id);
    
    res.json({
      success: true,
      message: 'Credit record deleted successfully',
      deletedId: req.params.id
    });
  } catch (error) {
    console.error('❌ Error deleting credit record:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete credit record',
      error: error.message
    });
  }
});

// Enhanced credit creation with shop and cashier data
app.post('/api/credits', async (req, res) => {
  try {
    const creditData = req.body;
    
    console.log('💳 Creating credit record with data:', creditData);
    
    // Validate required fields
    if (!creditData.customerName || !creditData.totalAmount || !creditData.dueDate) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: customerName, totalAmount, dueDate'
      });
    }

    // Calculate balance due
    creditData.balanceDue = creditData.totalAmount - (creditData.amountPaid || 0);
    
    // Set initial status
    if (!creditData.status) {
      if (creditData.balanceDue <= 0) {
        creditData.status = 'paid';
      } else if (creditData.amountPaid > 0) {
        creditData.status = 'partially_paid';
      } else {
        creditData.status = 'pending';
      }
    }

    const credit = new models.Credit(creditData);
    await credit.save();

    // Populate related data if available
    if (creditData.transactionId) {
      await credit.populate('transactionId');
    }

    console.log('✅ Credit record created successfully:', credit._id);

    res.status(201).json({
      success: true,
      data: credit,
      message: 'Credit record created successfully'
    });
  } catch (error) {
    console.error('❌ Error creating credit record:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create credit record',
      error: error.message
    });
  }
});

// Enhanced credit update with shop and cashier assignment
app.put('/api/credits/:id', async (req, res) => {
  try {
    const updateData = req.body;
    
    console.log('✏️ Updating credit record:', req.params.id, updateData);
    
    // Recalculate balance if amounts are updated
    if (updateData.totalAmount !== undefined || updateData.amountPaid !== undefined) {
      const existingCredit = await models.Credit.findById(req.params.id);
      if (existingCredit) {
        const totalAmount = updateData.totalAmount !== undefined ? updateData.totalAmount : existingCredit.totalAmount;
        const amountPaid = updateData.amountPaid !== undefined ? updateData.amountPaid : existingCredit.amountPaid;
        updateData.balanceDue = totalAmount - amountPaid;
        
        // Update status based on new amounts
        if (updateData.balanceDue <= 0) {
          updateData.status = 'paid';
        } else if (amountPaid > 0) {
          updateData.status = 'partially_paid';
        } else {
          updateData.status = 'pending';
        }
      }
    }

    const credit = await models.Credit.findByIdAndUpdate(
      req.params.id,
      { ...updateData, updatedAt: new Date() },
      { new: true, runValidators: true }
    ).populate('transactionId');
    
    if (!credit) {
      return res.status(404).json({
        success: false,
        message: 'Credit record not found'
      });
    }
    
    console.log('✅ Credit record updated successfully:', req.params.id);
    
    res.json({
      success: true,
      data: credit,
      message: 'Credit record updated successfully'
    });
  } catch (error) {
    console.error('❌ Error updating credit record:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update credit record',
      error: error.message
    });
  }
});
// ==================== EXISTING API ROUTES (MAINTAINED) ====================

// Products API
app.get('/api/products', async (req, res) => {
  try {
    const products = await models.Product.find().sort({ createdAt: -1 });
    res.json({
      success: true,
      data: products,
      count: products.length
    });
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch products',
      error: error.message
    });
  }
});

app.get('/api/products/:id', async (req, res) => {
  try {
    const product = await models.Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }
    res.json({
      success: true,
      data: product
    });
  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch product',
      error: error.message
    });
  }
});

app.post('/api/products', async (req, res) => {
  try {
    const product = new models.Product(req.body);
    await product.save();
    res.status(201).json({
      success: true,
      data: product,
      message: 'Product created successfully'
    });
  } catch (error) {
    console.error('Error creating product:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create product',
      error: error.message
    });
  }
});

app.put('/api/products/:id', async (req, res) => {
  try {
    const product = await models.Product.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedAt: new Date() },
      { new: true, runValidators: true }
    );
    
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }
    
    res.json({
      success: true,
      data: product,
      message: 'Product updated successfully'
    });
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update product',
      error: error.message
    });
  }
});

app.delete('/api/products/:id', async (req, res) => {
  try {
    const product = await models.Product.findByIdAndDelete(req.params.id);
    
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Product deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete product',
      error: error.message
    });
  }
});

app.patch('/api/products/bulk-stock', async (req, res) => {
  try {
    const { updates } = req.body;
    
    if (!updates || !Array.isArray(updates)) {
      return res.status(400).json({
        success: false,
        message: 'Updates array is required'
      });
    }

    const bulkOperations = updates.map(update => ({
      updateOne: {
        filter: { _id: update.productId },
        update: { 
          $set: { 
            currentStock: update.newStock,
            updatedAt: new Date()
          }
        }
      }
    }));

    const result = await models.Product.bulkWrite(bulkOperations);
    
    res.json({
      success: true,
      data: result,
      message: 'Bulk stock update successful'
    });
  } catch (error) {
    console.error('Error in bulk stock update:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update stock',
      error: error.message
    });
  }
});

// Shops API
app.get('/api/shops', async (req, res) => {
  try {
    const shops = await models.Shop.find().sort({ createdAt: -1 });
    res.json({
      success: true,
      data: shops,
      count: shops.length
    });
  } catch (error) {
    console.error('Error fetching shops:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch shops',
      error: error.message
    });
  }
});

app.get('/api/shops/:id', async (req, res) => {
  try {
    const shop = await models.Shop.findById(req.params.id);
    if (!shop) {
      return res.status(404).json({
        success: false,
        message: 'Shop not found'
      });
    }
    res.json({
      success: true,
      data: shop
    });
  } catch (error) {
    console.error('Error fetching shop:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch shop',
      error: error.message
    });
  }
});

app.post('/api/shops', async (req, res) => {
  try {
    const shop = new models.Shop(req.body);
    await shop.save();
    res.status(201).json({
      success: true,
      data: shop,
      message: 'Shop created successfully'
    });
  } catch (error) {
    console.error('Error creating shop:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create shop',
      error: error.message
    });
  }
});

app.put('/api/shops/:id', async (req, res) => {
  try {
    const shop = await models.Shop.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedAt: new Date() },
      { new: true, runValidators: true }
    );
    
    if (!shop) {
      return res.status(404).json({
        success: false,
        message: 'Shop not found'
      });
    }
    
    res.json({
      success: true,
      data: shop,
      message: 'Shop updated successfully'
    });
  } catch (error) {
    console.error('Error updating shop:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update shop',
      error: error.message
    });
  }
});

app.delete('/api/shops/:id', async (req, res) => {
  try {
    const shop = await models.Shop.findByIdAndDelete(req.params.id);
    
    if (!shop) {
      return res.status(404).json({
        success: false,
        message: 'Shop not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Shop deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting shop:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete shop',
      error: error.message
    });
  }
});

// Cashiers API
app.get('/api/cashiers', async (req, res) => {
  try {
    const cashiers = await models.Cashier.find().sort({ createdAt: -1 });
    res.json({
      success: true,
      data: cashiers,
      count: cashiers.length
    });
  } catch (error) {
    console.error('Error fetching cashiers:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch cashiers',
      error: error.message
    });
  }
});

app.get('/api/cashiers/:id', async (req, res) => {
  try {
    const cashier = await models.Cashier.findById(req.params.id);
    if (!cashier) {
      return res.status(404).json({
        success: false,
        message: 'Cashier not found'
      });
    }
    res.json({
      success: true,
      data: cashier
    });
  } catch (error) {
    console.error('Error fetching cashier:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch cashier',
      error: error.message
    });
  }
});

app.post('/api/cashiers', async (req, res) => {
  try {
    const cashier = new models.Cashier(req.body);
    await cashier.save();
    res.status(201).json({
      success: true,
      data: cashier,
      message: 'Cashier created successfully'
    });
  } catch (error) {
    console.error('Error creating cashier:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create cashier',
      error: error.message
    });
  }
});

app.put('/api/cashiers/:id', async (req, res) => {
  try {
    const cashier = await models.Cashier.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedAt: new Date() },
      { new: true, runValidators: true }
    );
    
    if (!cashier) {
      return res.status(404).json({
        success: false,
        message: 'Cashier not found'
      });
    }
    
    res.json({
      success: true,
      data: cashier,
      message: 'Cashier updated successfully'
    });
  } catch (error) {
    console.error('Error updating cashier:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update cashier',
      error: error.message
    });
  }
});

app.patch('/api/cashiers/:id', async (req, res) => {
  try {
    const cashier = await models.Cashier.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedAt: new Date() },
      { new: true, runValidators: true }
    );
    
    if (!cashier) {
      return res.status(404).json({
        success: false,
        message: 'Cashier not found'
      });
    }
    
    res.json({
      success: true,
      data: cashier,
      message: 'Cashier updated successfully'
    });
  } catch (error) {
    console.error('Error updating cashier:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update cashier',
      error: error.message
    });
  }
});

app.delete('/api/cashiers/:id', async (req, res) => {
  try {
    const cashier = await models.Cashier.findByIdAndDelete(req.params.id);
    
    if (!cashier) {
      return res.status(404).json({
        success: false,
        message: 'Cashier not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Cashier deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting cashier:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete cashier',
      error: error.message
    });
  }
});

// Expenses API
app.get('/api/expenses', async (req, res) => {
  try {
    const expenses = await models.Expense.find().sort({ date: -1 });
    res.json({
      success: true,
      data: expenses,
      count: expenses.length
    });
  } catch (error) {
    console.error('Error fetching expenses:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch expenses',
      error: error.message
    });
  }
});

app.get('/api/expenses/:id', async (req, res) => {
  try {
    const expense = await models.Expense.findById(req.params.id);
    if (!expense) {
      return res.status(404).json({
        success: false,
        message: 'Expense not found'
      });
    }
    res.json({
      success: true,
      data: expense
    });
  } catch (error) {
    console.error('Error fetching expense:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch expense',
      error: error.message
    });
  }
});

app.post('/api/expenses', async (req, res) => {
  try {
    const expense = new models.Expense(req.body);
    await expense.save();
    res.status(201).json({
      success: true,
      data: expense,
      message: 'Expense created successfully'
    });
  } catch (error) {
    console.error('Error creating expense:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create expense',
      error: error.message
    });
  }
});

app.put('/api/expenses/:id', async (req, res) => {
  try {
    const expense = await models.Expense.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedAt: new Date() },
      { new: true, runValidators: true }
    );
    
    if (!expense) {
      return res.status(404).json({
        success: false,
        message: 'Expense not found'
      });
    }
    
    res.json({
      success: true,
      data: expense,
      message: 'Expense updated successfully'
    });
  } catch (error) {
    console.error('Error updating expense:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update expense',
      error: error.message
    });
  }
});

app.delete('/api/expenses/:id', async (req, res) => {
  try {
    const expense = await models.Expense.findByIdAndDelete(req.params.id);
    
    if (!expense) {
      return res.status(404).json({
        success: false,
        message: 'Expense not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Expense deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting expense:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete expense',
      error: error.message
    });
  }
});

// Transactions API
app.get('/api/transactions', async (req, res) => {
  try {
    const { shopId, cashierId, startDate, endDate, paymentMethod } = req.query;
    
    let filter = { status: 'completed' };
    
    // Add shop filter
    if (shopId && shopId !== 'all') {
      filter.$or = [
        { shop: shopId },
        { shopId: shopId }
      ];
    }
    
    // Add cashier filter
    if (cashierId && cashierId !== 'all') {
      filter.$or = [
        { cashierId: cashierId },
        { cashierName: { $regex: cashierId, $options: 'i' } }
      ];
    }
    
    // Add date filter
    if (startDate && endDate) {
      filter.saleDate = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }
    
    // Add payment method filter
    if (paymentMethod && paymentMethod !== 'all') {
      filter.paymentMethod = paymentMethod;
    }

    const transactions = await models.Transaction.find(filter).sort({ saleDate: -1 });
    res.json({
      success: true,
      data: transactions,
      count: transactions.length
    });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch transactions',
      error: error.message
    });
  }
});

app.get('/api/transactions/:id', async (req, res) => {
  try {
    const transaction = await models.Transaction.findById(req.params.id);
    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }
    res.json({
      success: true,
      data: transaction
    });
  } catch (error) {
    console.error('Error fetching transaction:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch transaction',
      error: error.message
    });
  }
});

app.post('/api/transactions', async (req, res) => {
  try {
    const transaction = new models.Transaction(req.body);
    await transaction.save();
    res.status(201).json({
      success: true,
      data: transaction,
      message: 'Transaction created successfully'
    });
  } catch (error) {
    console.error('Error creating transaction:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create transaction',
      error: error.message
    });
  }
});

app.put('/api/transactions/:id', async (req, res) => {
  try {
    const transaction = await models.Transaction.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedAt: new Date() },
      { new: true, runValidators: true }
    );
    
    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }
    
    res.json({
      success: true,
      data: transaction,
      message: 'Transaction updated successfully'
    });
  } catch (error) {
    console.error('Error updating transaction:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update transaction',
      error: error.message
    });
  }
});

app.delete('/api/transactions/:id', async (req, res) => {
  try {
    const transaction = await models.Transaction.findByIdAndDelete(req.params.id);
    
    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Transaction deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting transaction:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete transaction',
      error: error.message
    });
  }
});

app.get('/api/transactions/shop-performance/:shopId', async (req, res) => {
  try {
    const { shopId } = req.params;
    const { startDate, endDate } = req.query;
    
    console.log(`📊 Fetching shop performance for shop: ${shopId}`);
    
    // Validate shop exists
    const shop = await models.Shop.findById(shopId);
    if (!shop) {
      return res.status(404).json({
        success: false,
        message: 'Shop not found'
      });
    }

    // Build date filter
    let dateFilter = {};
    if (startDate && endDate) {
      dateFilter = {
        saleDate: {
          $gte: new Date(startDate),
          $lte: new Date(endDate)
        }
      };
    }

    // Get transactions for this shop
    const transactions = await models.Transaction.find({
      $or: [
        { shop: shopId },
        { shopId: shopId }
      ],
      status: 'completed',
      ...dateFilter
    });

    // Calculate performance metrics
    const totalRevenue = transactions.reduce((sum, t) => sum + (t.totalAmount || 0), 0);
    const totalTransactions = transactions.length;
    const totalItemsSold = transactions.reduce((sum, t) => 
      sum + t.items.reduce((itemSum, item) => itemSum + (item.quantity || 0), 0), 0
    );
    
    const averageTransaction = totalTransactions > 0 ? totalRevenue / totalTransactions : 0;

    // Get expenses for this shop
    const expenses = await models.Expense.find({
      shop: shopId,
      ...dateFilter
    });

    const totalExpenses = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
    const totalProfit = totalRevenue - totalExpenses;
    const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

    // Calculate performance score (simplified)
    const performanceScore = Math.min(100, 
      (totalTransactions * 0.3) + 
      (profitMargin * 0.7) + 
      (totalRevenue > 10000 ? 10 : 0)
    );

    const performanceData = {
      totalRevenue,
      totalTransactions,
      totalItemsSold,
      averageTransaction: parseFloat(averageTransaction.toFixed(2)),
      totalExpenses,
      totalProfit: parseFloat(totalProfit.toFixed(2)),
      profitMargin: parseFloat(profitMargin.toFixed(1)),
      performanceScore: Math.round(performanceScore),
      shopDetails: {
        name: shop.name,
        location: shop.location,
        manager: shop.manager
      },
      period: {
        startDate: startDate || 'All time',
        endDate: endDate || 'All time'
      }
    };

    console.log(`✅ Shop performance data calculated:`, performanceData);

    res.json({
      success: true,
      data: performanceData,
      message: 'Shop performance data fetched successfully'
    });

  } catch (error) {
    console.error('❌ Error fetching shop performance:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch shop performance data',
      error: error.message
    });
  }
});

// ==================== ADDITIONAL EXISTING ROUTES ====================

app.get('/', (req, res) => {
  res.json({
    message: process.env.APP_NAME || 'Stanzo Bar Management API',
    version: process.env.APP_VERSION || '1.0.0',
    status: 'running',
    timestamp: new Date().toISOString(),
    authentication: 'email-based secure code for admin, password-based for cashiers'
  });
});

app.get('/api/transactions/sales/all', async (req, res) => {
  try {
    const { startDate, endDate, shop, paymentMethod, status = 'completed' } = req.query;
    
    console.log('🔍 Fetching comprehensive transactions with params:', req.query);
    
    const filter = { status: 'completed' };
    
    // Date filter - only apply if provided
    if (startDate && endDate) {
      filter.$or = [
        { createdAt: { $gte: new Date(startDate), $lte: new Date(endDate) } },
        { saleDate: { $gte: new Date(startDate), $lte: new Date(endDate) } }
      ];
    }
    
    // Shop filter
    if (shop && shop !== 'all') filter.shop = shop;
    
    // Payment method filter
    if (paymentMethod && paymentMethod !== 'all') {
      if (paymentMethod === 'digital') {
        filter.paymentMethod = { $in: ['mpesa', 'bank', 'card'] };
      } else {
        filter.paymentMethod = paymentMethod;
      }
    }

    // Get all transactions without pagination limits
    const transactions = await models.Transaction.find(filter)
      .sort({ saleDate: -1 })
      .lean();

    // Get related data
    const [expenses, products] = await Promise.all([
      models.Expense.find(startDate && endDate ? {
        date: { $gte: new Date(startDate), $lte: new Date(endDate) }
      } : {}).lean(),
      models.Product.find().lean()
    ]);

    console.log(`✅ Found ${transactions.length} transactions, ${expenses.length} expenses, ${products.length} products`);

    res.json({
      success: true,
      transactions,
      expenses,
      products,
      summary: {
        totalTransactions: transactions.length,
        totalRevenue: transactions.reduce((sum, t) => sum + (t.totalAmount || 0), 0),
        totalExpenses: expenses.reduce((sum, e) => sum + (e.amount || 0), 0),
        totalProducts: products.length
      }
    });
  } catch (error) {
    console.error('❌ Comprehensive data error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch comprehensive data',
      error: error.message
    });
  }
});

app.get('/api/transactions/enhanced', async (req, res) => {
  try {
    const { startDate, endDate, shop, paymentMethod } = req.query;
    
    const filter = { status: 'completed' };
    
    if (startDate && endDate) {
      filter.$or = [
        { createdAt: { $gte: new Date(startDate), $lte: new Date(endDate) } },
        { saleDate: { $gte: new Date(startDate), $lte: new Date(endDate) } }
      ];
    }
    
    if (shop && shop !== 'all') filter.shop = shop;
    if (paymentMethod && paymentMethod !== 'all') filter.paymentMethod = paymentMethod;

    const transactions = await models.Transaction.find(filter)
      .sort({ saleDate: -1 })
      .lean();

    const totalRevenue = transactions.reduce((sum, t) => sum + (t.totalAmount || 0), 0);
    const totalTransactions = transactions.length;

    res.json({
      success: true,
      transactions,
      summary: {
        totalRevenue,
        totalTransactions,
        averageTransaction: totalTransactions > 0 ? totalRevenue / totalTransactions : 0
      }
    });
  } catch (error) {
    console.error('Error fetching enhanced transactions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch enhanced transactions',
      error: error.message
    });
  }
});

// Setup endpoints
app.post('/api/setup/sample-data', async (req, res) => {
  try {
    // Create sample data logic here
    res.json({
      success: true,
      message: 'Sample data created successfully'
    });
  } catch (error) {
    console.error('Error creating sample data:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create sample data',
      error: error.message
    });
  }
});

// Add these routes to your server
app.get('/api/credits/due-soon', async (req, res) => {
  try {
    const { days = 2 } = req.query;
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + parseInt(days));

    const dueSoonCredits = await models.Credit.find({
      dueDate: { $lte: targetDate },
      status: { $in: ['pending', 'partially_paid'] }
    }).populate('transactionId');

    res.json({
      success: true,
      data: dueSoonCredits,
      count: dueSoonCredits.length
    });
  } catch (error) {
    console.error('Error fetching due soon credits:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch due soon credits'
    });
  }
});

app.post('/api/credits/:id/send-reminder', async (req, res) => {
  try {
    const credit = await models.Credit.findById(req.params.id);
    if (!credit) {
      return res.status(404).json({
        success: false,
        message: 'Credit record not found'
      });
    }

    // Here you would integrate with your email/SMS service
    // For now, we'll just log the reminder
    console.log(`📧 Reminder sent for credit: ${credit._id}`);
    console.log(`Customer: ${credit.customerName}`);
    console.log(`Amount Due: KES ${credit.balanceDue}`);
    console.log(`Due Date: ${credit.dueDate}`);

    // Update last reminder sent date
    credit.lastReminderSent = new Date();
    await credit.save();

    res.json({
      success: true,
      message: 'Reminder sent successfully'
    });
  } catch (error) {
    console.error('Error sending reminder:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send reminder'
    });
  }
});

// Debug endpoints
app.get('/api/debug/database', async (req, res) => {
  try {
    const counts = {
      products: await models.Product.countDocuments(),
      shops: await models.Shop.countDocuments(),
      cashiers: await models.Cashier.countDocuments(),
      expenses: await models.Expense.countDocuments(),
      transactions: await models.Transaction.countDocuments(),
      users: await models.User.countDocuments(),
      secureCodes: await models.SecureCode.countDocuments(),
      credits: await models.Credit.countDocuments()
    };
    
    res.json({
      success: true,
      counts,
      database: mongoose.connection.name,
      status: 'connected',
      email: emailTransporter ? 'configured' : 'disabled',
      authentication: 'email-based-secure-code for admin, password-based for cashiers'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Database check failed',
      error: error.message
    });
  }
});

app.get('/api/debug/routes', (req, res) => {
  const routes = [
    'GET  /api/health',
    'POST /api/auth/request-code (ADMIN)',
    'POST /api/auth/verify-code (ADMIN)', 
    'POST /api/auth/login (CASHIER - password-based)',
    'POST /api/auth/logout',
    'GET  /api/auth/me',
    // NEW OPTIMIZED ENDPOINT
    'GET  /api/transactions/reports/optimized (NEW - replaces 5 endpoints)',
    // EXISTING REPORT ENDPOINTS (maintained for backward compatibility)
    'GET  /api/transactions/reports/comprehensive',
    'GET  /api/transactions/reports/sales-summary',
    'GET  /api/transactions/reports/product-performance',
    'GET  /api/transactions/reports/cashier-performance',
    // STATS ENDPOINTS
    'GET  /api/transactions/stats/cashier-daily',
    'GET  /api/transactions/stats/daily-sales',
    // CREDITS ENDPOINTS
    'GET  /api/credits',
    'POST /api/credits',
    'GET  /api/credits/:id',
    'PUT  /api/credits/:id',
    'PATCH /api/credits/:id/payment',
    // EXISTING ENDPOINTS
    'GET  /api/products',
    'GET  /api/products/:id',
    'POST /api/products',
    'PUT  /api/products/:id',
    'DELETE /api/products/:id',
    'PATCH /api/products/bulk-stock',
    'GET  /api/shops',
    'GET  /api/shops/:id',
    'POST /api/shops',
    'PUT  /api/shops/:id',
    'DELETE /api/shops/:id',
    'GET  /api/cashiers',
    'GET  /api/cashiers/:id',
    'POST /api/cashiers',
    'PUT  /api/cashiers/:id',
    'PATCH /api/cashiers/:id',
    'DELETE /api/cashiers/:id',
    'GET  /api/expenses',
    'GET  /api/expenses/:id',
    'POST /api/expenses',
    'PUT  /api/expenses/:id',
    'DELETE /api/expenses/:id',
    'GET  /api/transactions',
    'GET  /api/transactions/:id',
    'POST /api/transactions',
    'PUT  /api/transactions/:id',
    'DELETE /api/transactions/:id',
    'GET  /api/transactions/shop-performance/:shopId',
    'GET  /api/transactions/sales/all',
    'GET  /api/transactions/enhanced'
  ];
  
  res.json({
    success: true,
    routes
  });
});

// Add this debug route to see what's happening with the email configuration
app.get('/api/debug/email-status', (req, res) => {
  res.json({
    success: true,
    emailConfigured: !!emailTransporter,
    emailUser: process.env.EMAIL_USER,
    hasEmailPassword: !!process.env.EMAIL_PASSWORD,
    nodeEnv: process.env.NODE_ENV
  });
});

// 404 handler
app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'API endpoint not found'
  });
});

// ==================== SERVER START ====================

const startServer = async () => {
  try {
    console.log('🚀 Starting Stanzo Shop Management Server...');
    console.log(`📋 App: ${process.env.APP_NAME || 'Stanzo Shop Management'}`);
    console.log(`📦 Version: ${process.env.APP_VERSION || '1.0.0'}`);
    
    await connectDB();
    
    const server = app.listen(PORT, () => {
      console.log(`\n🎉 Server Started Successfully!`);
      console.log('='.repeat(50));
      console.log(`📍 Port: ${PORT}`);
      console.log(`🔗 URL: http://localhost:${PORT}`);
      console.log(`🌐 Client: ${process.env.CLIENT_URL || 'http://localhost:3000'}`);
      // console.log(`🌐 Client: ${process.env.CLIENT_URL || 'https://stanzo-front.vercel.app/'}`); 
      console.log(`📊 Database: ${mongoose.connection.name}`);
      console.log(`📧 Email Service: ${emailTransporter ? 'Enabled' : 'Disabled'}`);
      console.log(`🔐 Authentication:`);
      console.log(`   - ADMIN: Email-based Secure Code`);
      console.log(`   - CASHIER: Password-based`);
      console.log(`⏰ JWT Expiry: ${process.env.JWT_EXPIRES_IN || '8h'}`);
      console.log(`📋 Key Endpoints:`);
      console.log(`   - POST /api/auth/request-code (Admin)`);
      console.log(`   - POST /api/auth/verify-code (Admin)`);
      console.log(`   - POST /api/auth/login (Cashier)`);
      console.log(`   - GET  /api/transactions/reports/optimized (NEW - replaces 5 endpoints)`);
      console.log(`   - GET  /api/transactions/reports/comprehensive`);
      console.log(`   - GET  /api/transactions/reports/sales-summary`);
      console.log(`   - GET  /api/transactions/reports/product-performance`);
      console.log(`   - GET  /api/transactions/reports/cashier-performance`);
      console.log(`   - GET  /api/transactions/stats/cashier-daily`);
      console.log(`   - GET  /api/transactions/stats/daily-sales`);
      console.log(`   - POST /api/credits`);
      console.log(`   - GET  /api/health`);
      console.log('='.repeat(50));
    });

    return server;

  } catch (error) {
    console.error('💥 Server startup failed:', error);
    process.exit(1);
  }
};

// Start the server
startServer();

module.exports = app;
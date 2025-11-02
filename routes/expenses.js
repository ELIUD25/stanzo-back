// routes/expenses.js
const express = require('express');
const router = express.Router();
const Expense = require('../models/Expense');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');

// Get all expenses
router.get('/', catchAsync(async (req, res, next) => {
  const { page = 1, limit = 10, startDate, endDate, category } = req.query;
  
  const filter = {};
  if (startDate && endDate) {
    filter.date = {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    };
  }
  if (category) filter.category = category;

  const expenses = await Expense.find(filter)
    .sort({ date: -1, createdAt: -1 })
    .limit(limit * 1)
    .skip((page - 1) * limit);

  const total = await Expense.countDocuments(filter);

  res.json({
    success: true,
    data: expenses,
    pagination: {
      current: parseInt(page),
      total: Math.ceil(total / limit),
      results: total
    }
  });
}));

// Get single expense
router.get('/:id', catchAsync(async (req, res, next) => {
  const expense = await Expense.findById(req.params.id);
  
  if (!expense) {
    return next(new AppError('Expense not found', 404));
  }

  res.json({
    success: true,
    data: expense
  });
}));

// Create new expense
router.post('/', catchAsync(async (req, res, next) => {
  const { category, amount, date, paymentMethod } = req.body;

  // Validation
  if (!category || !amount) {
    return next(new AppError('Missing required fields: category and amount are required', 400));
  }

  if (amount <= 0) {
    return next(new AppError('Amount must be greater than 0', 400));
  }

  // For development/demo purposes, use a default createdBy ID
  const createdBy = req.user?._id || '65d8f1a9c8b9c4a7e8f3b2a1';

  const expenseData = {
    category: category.toLowerCase(),
    amount: parseFloat(amount),
    paymentMethod: (paymentMethod || 'cash').toLowerCase(),
    date: date ? new Date(date) : new Date(),
    createdBy
  };

  const expense = await Expense.create(expenseData);

  res.status(201).json({
    success: true,
    message: 'Expense recorded successfully',
    data: expense
  });
}));

// Update expense
router.put('/:id', catchAsync(async (req, res, next) => {
  const { category, amount, date, paymentMethod } = req.body;

  const expense = await Expense.findById(req.params.id);
  
  if (!expense) {
    return next(new AppError('Expense not found', 404));
  }

  // Update fields
  if (category) expense.category = category.toLowerCase();
  if (amount) expense.amount = parseFloat(amount);
  if (date) expense.date = new Date(date);
  if (paymentMethod) expense.paymentMethod = paymentMethod.toLowerCase();

  await expense.save();

  res.json({
    success: true,
    message: 'Expense updated successfully',
    data: expense
  });
}));

// Delete expense
router.delete('/:id', catchAsync(async (req, res, next) => {
  const expense = await Expense.findByIdAndDelete(req.params.id);
  
  if (!expense) {
    return next(new AppError('Expense not found', 404));
  }

  res.json({
    success: true,
    message: 'Expense deleted successfully'
  });
}));

// Get expense statistics
router.get('/stats/overview', catchAsync(async (req, res, next) => {
  const { startDate, endDate } = req.query;
  
  const filter = {};
  if (startDate && endDate) {
    filter.date = {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    };
  }

  const stats = await Expense.aggregate([
    { $match: filter },
    {
      $group: {
        _id: null,
        totalExpenses: { $sum: 1 },
        totalAmount: { $sum: '$amount' },
        averageExpense: { $avg: '$amount' },
        minExpense: { $min: '$amount' },
        maxExpense: { $max: '$amount' }
      }
    }
  ]);

  const byCategory = await Expense.aggregate([
    { $match: filter },
    {
      $group: {
        _id: '$category',
        count: { $sum: 1 },
        total: { $sum: '$amount' },
        average: { $avg: '$amount' }
      }
    },
    { $sort: { total: -1 } }
  ]);

  const byPaymentMethod = await Expense.aggregate([
    { $match: filter },
    {
      $group: {
        _id: '$paymentMethod',
        count: { $sum: 1 },
        total: { $sum: '$amount' },
        average: { $avg: '$amount' }
      }
    }
  ]);

  const recentExpenses = await Expense.find(filter)
    .sort({ date: -1, createdAt: -1 })
    .limit(5);

  res.json({
    success: true,
    data: {
      overview: stats[0] || { 
        totalExpenses: 0, 
        totalAmount: 0, 
        averageExpense: 0, 
        minExpense: 0, 
        maxExpense: 0 
      },
      byCategory,
      byPaymentMethod,
      recentExpenses
    }
  });
}));

module.exports = router;
const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema({
  category: {
    type: String,
    required: [true, 'Expense category is required'],
    enum: ['rent', 'utilities', 'salaries', 'supplies', 'maintenance', 'marketing', 'transport', 'other'],
    lowercase: true
  },
  amount: {
    type: Number,
    required: [true, 'Expense amount is required'],
    min: [0, 'Amount cannot be negative'],
    set: v => parseFloat(parseFloat(v).toFixed(2))
  },
  date: {
    type: Date,
    required: [true, 'Expense date is required'],
    default: Date.now
  },
  paymentMethod: {
    type: String,
    required: [true, 'Payment method is required'],
    enum: ['cash', 'mpesa'],
    default: 'cash',
    lowercase: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Virtual for formatted date
expenseSchema.virtual('formattedDate').get(function() {
  return this.date.toLocaleDateString('en-KE');
});

// Virtual for formatted amount
expenseSchema.virtual('formattedAmount').get(function() {
  return `KSh ${this.amount.toFixed(2)}`;
});

// Ensure virtuals are included in JSON output
expenseSchema.set('toJSON', { virtuals: true });
expenseSchema.set('toObject', { virtuals: true });

// Indexes for better performance
expenseSchema.index({ date: -1 });
expenseSchema.index({ category: 1, date: -1 });
expenseSchema.index({ createdBy: 1, date: -1 });

// Pre-save middleware to ensure proper formatting
expenseSchema.pre('save', function(next) {
  if (this.isModified('category')) {
    this.category = this.category.toLowerCase();
  }
  if (this.isModified('paymentMethod')) {
    this.paymentMethod = this.paymentMethod.toLowerCase();
  }
  if (this.isModified('amount')) {
    this.amount = parseFloat(parseFloat(this.amount).toFixed(2));
  }
  next();
});

module.exports = mongoose.model('Expense', expenseSchema);
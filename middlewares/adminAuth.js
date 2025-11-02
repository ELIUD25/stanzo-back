// backend/middleware/adminAuth.js
const adminAuth = (req, res, next) => {
  // Check if user is authenticated and is an admin
  if (req.session && req.session.isAuthenticated) {
    // Check if it's the specific admin user
    if (req.session.adminEmail === 'kinyuastanzo6759@gmail.com' || 
        req.session.email === 'kinyuastanzo6759@gmail.com') {
      return next();
    }
  }
  
  return res.status(401).json({
    success: false,
    message: 'Admin authentication required'
  });
};

module.exports = adminAuth;
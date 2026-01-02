const isAuthenticated = (req, res, next) => {
    if (req.session && req.session.user) {
        return next();
    }
    req.session.error = 'Please login to access this page';
    res.redirect('/login');
};

module.exports = { isAuthenticated };
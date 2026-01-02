require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const path = require('path');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const fs = require('fs');

const app = express();

// Database connection
mongoose.connect('mongodb://localhost:27017/book_publish_platform', {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => console.log('MongoDB connected successfully'))
.catch(err => console.error('MongoDB connection error:', err));

// Import models
const User = require('./models/User');

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));

// Session
app.use(session({
    secret: 'your-secret-key-change-this',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: 'mongodb://localhost:27017/book_publish_platform'
    }),
    cookie: { 
        maxAge: 1000 * 60 * 60 * 24
    }
}));

// Passport
app.use(passport.initialize());
app.use(passport.session());

// Passport config
passport.use(new LocalStrategy({
    usernameField: 'usernameOrEmail'
}, async (usernameOrEmail, password, done) => {
    try {
        const user = await User.findOne({
            $or: [
                { email: usernameOrEmail },
                { username: usernameOrEmail }
            ]
        });

        if (!user) {
            return done(null, false, { message: 'Invalid credentials' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        
        if (!isMatch) {
            return done(null, false, { message: 'Invalid credentials' });
        }

        return done(null, user);
    } catch (error) {
        return done(error);
    }
}));

passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
    try {
        const user = await User.findById(id);
        done(null, user);
    } catch (error) {
        done(error);
    }
});

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Configure multer for profile pictures
const profileStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'public/uploads/profiles/');
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'profile-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const uploadProfile = multer({
    storage: profileStorage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        const filetypes = /jpeg|jpg|png|gif|webp/;
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = filetypes.test(file.mimetype);
        
        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Error: Images only (jpeg, jpg, png, gif, webp)!'));
        }
    }
});

// Create uploads directories if they don't exist
const uploadDirs = [
    'public/uploads',
    'public/uploads/profiles',
    'public/uploads/covers',
    'public/uploads/books'
];

uploadDirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`Created directory: ${dir}`);
    }
});

// Create default avatar if it doesn't exist
const defaultAvatarPath = 'public/uploads/default-avatar.png';
if (!fs.existsSync(defaultAvatarPath)) {
    const defaultAvatar = `<svg width="100" height="100" xmlns="http://www.w3.org/2000/svg">
        <circle cx="50" cy="50" r="45" fill="#4f46e5"/>
        <text x="50" y="58" text-anchor="middle" fill="white" font-size="36" font-family="Arial">U</text>
    </svg>`;
    
    fs.writeFileSync(defaultAvatarPath, defaultAvatar);
    console.log('Default avatar created');
}

// Global middleware
app.use((req, res, next) => {
    res.locals.currentUser = req.user || null;
    res.locals.success = req.session.success || null;
    res.locals.error = req.session.error || null;
    delete req.session.success;
    delete req.session.error;
    next();
});

// Debug middleware - logs ALL POST requests
app.use((req, res, next) => {
    if (req.method === 'POST') {
        console.log('POST REQUEST:', {
            url: req.url,
            body: req.body,
            time: new Date().toISOString()
        });
    }
    next();
});

// Authentication middleware
const isAuthenticated = (req, res, next) => {
    if (req.isAuthenticated()) {
        return next();
    }
    req.session.error = 'Please login to access this page';
    res.redirect('/login');
};

// Import routes
const authRoutes = require('./routes/auth')(passport);
const bookRoutes = require('./routes/books');

// Use routes
app.use('/', authRoutes);
app.use('/', bookRoutes);

// Home route
app.get('/', (req, res) => {
    if (req.isAuthenticated()) {
        res.redirect('/homepage');
    } else {
        res.redirect('/login');
    }
});

// ===== PROFILE ROUTES =====

// Update profile with URL
app.post('/updateprofile', isAuthenticated, async (req, res) => {
    console.log('=== UPDATE PROFILE CALLED ===');
    console.log('Request body:', req.body);
    
    try {
        const User = require('./models/User');
        const userId = req.user._id;
        
        // Get current user from database
        const currentUser = await User.findById(userId);
        console.log('Current user from DB:', {
            profilePicture: currentUser.profilePicture,
            bio: currentUser.bio
        });
        
        // Prepare update
        const updates = {};
        
        if (req.body.bio) {
            updates.bio = req.body.bio.substring(0, 50);
            console.log('Updating bio to:', updates.bio);
        }
        
        if (req.body.profilePicture && req.body.profilePicture.trim()) {
            updates.profilePicture = req.body.profilePicture.trim();
            console.log('Updating profilePicture to:', updates.profilePicture);
        } else {
            console.log('No profilePicture in request or empty');
        }
        
        // Update database
        console.log('Updating database with:', updates);
        const updatedUser = await User.findByIdAndUpdate(
            userId,
            updates,
            { new: true } // Return updated document
        );
        
        console.log('Updated user from DB:', {
            profilePicture: updatedUser.profilePicture,
            bio: updatedUser.bio
        });
        
        // Update session
        req.user.bio = updatedUser.bio;
        req.user.profilePicture = updatedUser.profilePicture;
        
        // Force passport to update session
        req.login(updatedUser, (err) => {
            if (err) {
                console.error('Login error:', err);
            }
            console.log('Session updated with new profilePicture:', req.user.profilePicture);
            
            req.session.success = 'Profile updated successfully!';
            res.redirect('/userprofile');
        });
        
    } catch (error) {
        console.error('UPDATE ERROR:', error);
        req.session.error = 'Update failed: ' + error.message;
        res.redirect('/userprofile');
    }
});

// Upload profile picture file
app.post('/upload-profile-pic', isAuthenticated, uploadProfile.single('profilePictureFile'), async (req, res) => {
    try {
        console.log('=== FILE UPLOAD CALLED ===');
        
        if (!req.file) {
            req.session.error = 'Please select an image file to upload';
            return res.redirect('/userprofile');
        }
        
        const User = require('./models/User');
        const profilePicturePath = `/uploads/profiles/${req.file.filename}`;
        
        console.log('Uploaded file:', {
            filename: req.file.filename,
            path: profilePicturePath,
            size: req.file.size
        });
        
        // Update database
        const updatedUser = await User.findByIdAndUpdate(
            req.user._id,
            { profilePicture: profilePicturePath },
            { new: true }
        );
        
        console.log('Database updated with:', updatedUser.profilePicture);
        
        // Update session
        req.user.profilePicture = profilePicturePath;
        
        // Force session update
        req.login(updatedUser, (err) => {
            if (err) {
                console.error('Session update error:', err);
            }
            
            req.session.success = 'Profile picture uploaded successfully!';
            res.redirect('/userprofile');
        });
        
    } catch (error) {
        console.error('File upload error:', error);
        
        if (error.code === 'LIMIT_FILE_SIZE') {
            req.session.error = 'File too large. Maximum size is 5MB.';
        } else {
            req.session.error = 'Error uploading file: ' + error.message;
        }
        
        res.redirect('/userprofile');
    }
});

// ===== DEBUG ROUTES =====

// Debug route to see current user data
app.get('/debug/userdata', isAuthenticated, (req, res) => {
    res.json({
        database: req.user,
        session: req.session.passport,
        updateUrl: '/updateprofile'
    });
});

// Check database directly
app.get('/check-db-profile', isAuthenticated, async (req, res) => {
    const User = require('./models/User');
    const dbUser = await User.findById(req.user._id);
    
    const result = {
        database: {
            id: dbUser._id,
            profilePicture: dbUser.profilePicture,
            bio: dbUser.bio,
            username: dbUser.username
        },
        session: {
            profilePicture: req.user.profilePicture,
            bio: req.user.bio,
            username: req.user.username
        },
        match: dbUser.profilePicture === req.user.profilePicture
    };
    
    res.json(result);
});

// Force reload user session
app.get('/reload-session', isAuthenticated, async (req, res) => {
    const User = require('./models/User');
    const freshUser = await User.findById(req.user._id);
    
    // Re-login to refresh session
    req.login(freshUser, (err) => {
        if (err) {
            console.error('Session reload error:', err);
            res.send('Error reloading session');
        } else {
            res.send('Session reloaded! Profile picture: ' + freshUser.profilePicture);
        }
    });
});

// Test route to manually set profile picture
app.get('/fix-profile-pic', isAuthenticated, async (req, res) => {
    const User = require('./models/User');
    
    const newPic = 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&h=150&fit=crop';
    
    await User.findByIdAndUpdate(req.user._id, {
        profilePicture: newPic
    });
    
    // Get fresh user
    const freshUser = await User.findById(req.user._id);
    
    // Update session
    req.login(freshUser, (err) => {
        if (err) {
            res.send('Database updated but session error: ' + err.message);
        } else {
            res.send(`
                <h1>Profile Picture Fixed!</h1>
                <p>New picture: ${freshUser.profilePicture}</p>
                <a href="/userprofile">Go to Profile</a>
            `);
        }
    });
});

// ===== ERROR HANDLING =====

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    
    // Multer errors
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            req.session.error = 'File too large. Maximum size is 5MB.';
        } else {
            req.session.error = 'File upload error: ' + err.message;
        }
    } else if (err) {
        req.session.error = err.message;
    }
    
    const referer = req.headers.referer || '/';
    res.redirect(referer);
});

// 404 handler
app.use((req, res) => {
    res.status(404).render('404', { title: 'Page Not Found' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Profile upload directory: public/uploads/profiles/`);
});
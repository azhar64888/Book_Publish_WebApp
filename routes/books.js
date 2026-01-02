const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const Book = require('../models/Book');

// Configure multer
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        if (file.fieldname === 'bookFile') {
            cb(null, 'public/uploads/books/');
        } else {
            cb(null, 'public/uploads/covers/');
        }
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { 
        fileSize: 50 * 1024 * 1024
    }
});

// Middleware to check authentication
const isAuthenticated = (req, res, next) => {
    if (req.isAuthenticated()) {
        return next();
    }
    req.session.error = 'Please login to access this page';
    res.redirect('/login');
};

// Homepage route
router.get('/homepage', isAuthenticated, async (req, res) => {
    try {
        const books = await Book.find().populate('author', 'username');
        const categories = ['Business', 'Fiction', 'Non-Fiction', 'Technology', 'Science', 'Arts', 'Biography', 'History', 'Self-Help', 'Other'];
        
        console.log('Books found:', books.length); // Debug
        if (books.length > 0) {
            console.log('First book:', {
                title: books[0].title,
                author: books[0].author,
                description: books[0].description,
                downloads: books[0].downloads
            });
        }
        
        res.render('homepage', {
            title: 'Homepage',
            books: books || [],
            categories: categories,
            selectedCategory: null,
            user: req.user
        });
    } catch (error) {
        console.error('Homepage error:', error);
        req.session.error = 'Error loading books';
        res.redirect('/homepage');
    }
});

// Create Book Page
router.get('/createbook', isAuthenticated, (req, res) => {
    res.render('createbook', {
        title: 'Create Book',
        categories: ['Business', 'Fiction', 'Non-Fiction', 'Technology', 'Science', 'Arts', 'Biography', 'History', 'Self-Help', 'Other']
    });
});

// Create Book
router.post('/createbook', isAuthenticated, upload.fields([
    { name: 'coverImage', maxCount: 1 },
    { name: 'bookFile', maxCount: 1 }
]), async (req, res) => {
    try {
        const { title, publisherName, description, category } = req.body;
        
        if (!req.files || !req.files.bookFile) {
            req.session.error = 'Please upload a book file';
            return res.redirect('/createbook');
        }
        
        const coverImage = req.files.coverImage 
            ? `/uploads/covers/${req.files.coverImage[0].filename}`
            : (req.body.coverImage || '/uploads/default-cover.jpg');
        
        const book = new Book({
            title,
            author: req.user._id,
            publisherName,
            description,
            category,
            coverImage,
            bookFile: `/uploads/books/${req.files.bookFile[0].filename}`
        });
        
        await book.save();
        
        req.session.success = 'Book published successfully!';
        res.redirect('/userprofile');
        
    } catch (error) {
        console.error('Create book error:', error);
        req.session.error = 'Error publishing book: ' + error.message;
        res.redirect('/createbook');
    }
});

// ===== EDIT BOOK ROUTES =====
router.get('/editbook/:id', isAuthenticated, async (req, res) => {
    try {
        const book = await Book.findById(req.params.id);
        
        if (!book) {
            req.session.error = 'Book not found';
            return res.redirect('/userprofile');
        }
        
        // Check if user owns the book
        if (book.author.toString() !== req.user._id.toString()) {
            req.session.error = 'Unauthorized access';
            return res.redirect('/userprofile');
        }
        
        const categories = ['Business', 'Fiction', 'Non-Fiction', 'Technology', 'Science', 'Arts', 'Biography', 'History', 'Self-Help', 'Other'];
        
        res.render('editbook', {
            title: 'Edit Book',
            book: book,
            categories: categories,
            user: req.user
        });
    } catch (error) {
        console.error('Edit book error:', error);
        req.session.error = 'Error loading book';
        res.redirect('/userprofile');
    }
});

router.post('/editbook/:id', isAuthenticated, async (req, res) => {
    try {
        const { title, publisherName, description, category } = req.body;
        
        const book = await Book.findById(req.params.id);
        
        if (!book) {
            req.session.error = 'Book not found';
            return res.redirect('/userprofile');
        }
        
        // Check if user owns the book
        if (book.author.toString() !== req.user._id.toString()) {
            req.session.error = 'Unauthorized access';
            return res.redirect('/userprofile');
        }
        
        // Update book
        book.title = title;
        book.publisherName = publisherName;
        book.description = description;
        book.category = category;
        book.updatedAt = Date.now();
        
        await book.save();
        
        req.session.success = 'Book updated successfully!';
        res.redirect('/userprofile');
        
    } catch (error) {
        console.error('Update book error:', error);
        req.session.error = 'Error updating book';
        res.redirect(`/editbook/${req.params.id}`);
    }
});

// ===== DELETE BOOK ROUTES =====
router.get('/deletebook/:id', isAuthenticated, async (req, res) => {
    try {
        const book = await Book.findById(req.params.id).populate('author', 'username');
        
        if (!book) {
            req.session.error = 'Book not found';
            return res.redirect('/userprofile');
        }
        
        // Check if user owns the book
        if (book.author._id.toString() !== req.user._id.toString()) {
            req.session.error = 'Unauthorized access';
            return res.redirect('/userprofile');
        }
        
        res.render('deletebook', {
            title: 'Delete Book',
            book: book,
            user: req.user
        });
    } catch (error) {
        console.error('Delete book error:', error);
        req.session.error = 'Error loading book';
        res.redirect('/userprofile');
    }
});

router.post('/deletebook/:id', isAuthenticated, async (req, res) => {
    try {
        const book = await Book.findById(req.params.id);
        
        if (!book) {
            req.session.error = 'Book not found';
            return res.redirect('/userprofile');
        }
        
        // Check if user owns the book
        if (book.author.toString() !== req.user._id.toString()) {
            req.session.error = 'Unauthorized access';
            return res.redirect('/userprofile');
        }
        
        await book.deleteOne();
        
        req.session.success = 'Book deleted successfully!';
        res.redirect('/userprofile');
        
    } catch (error) {
        console.error('Delete book error:', error);
        req.session.error = 'Error deleting book';
        res.redirect('/userprofile');
    }
});

// ===== USER PROFILE ROUTE =====
router.get('/userprofile', isAuthenticated, async (req, res) => {
    try {
        const userBooks = await Book.find({ author: req.user._id });
        
        res.render('userprofile', {
            title: 'User Profile',
            user: req.user,
            books: userBooks || []
        });
    } catch (error) {
        console.error('User profile error:', error);
        req.session.error = 'Error loading profile';
        res.redirect('/homepage');
    }
});
// Download Book
router.get('/download/:id', isAuthenticated, async (req, res) => {
    try {
        const book = await Book.findById(req.params.id);
        
        if (!book) {
            req.session.error = 'Book not found';
            return res.redirect('/homepage');
        }
        
        book.downloads += 1;
        await book.save();
        
        const filePath = path.join(__dirname, '..', 'public', book.bookFile);
        
        res.download(filePath);
        
    } catch (error) {
        console.error('Download error:', error);
        req.session.error = 'Error downloading book';
        res.redirect('/homepage');
    }
});

// Get Books by Category
// Homepage route - fix this
router.get('/homepage', isAuthenticated, async (req, res) => {
    try {
        const books = await Book.find().populate('author', 'username profilePicture');
        const categories = ['Business', 'Fiction', 'Non-Fiction', 'Technology', 'Science', 'Arts', 'Biography', 'History', 'Self-Help', 'Other'];
        
        res.render('homepage', {
            title: 'Homepage',
            books,
            categories,
            selectedCategory: null, // Add this line
            user: req.user
        });
    } catch (error) {
        console.error('Homepage error:', error);
        req.session.error = 'Error loading books';
        res.redirect('/homepage');
    }
});

module.exports = router;  // Export router directly, not a function
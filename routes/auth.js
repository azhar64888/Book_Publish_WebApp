const express = require('express');
const router = express.Router();
const User = require('../models/User');

module.exports = (passport) => {
    // Register Page
    router.get('/register', (req, res) => {
        res.render('register', { title: 'Register' });
    });

    // Register User
    router.post('/register', async (req, res) => {
        try {
            const { username, email, password, confirmPassword } = req.body;
            
            if (password !== confirmPassword) {
                return res.render('register', { 
                    title: 'Register',
                    error: 'Passwords do not match'
                });
            }
            
            const existingUser = await User.findOne({ 
                $or: [{ email }, { username }] 
            });
            
            if (existingUser) {
                return res.render('register', { 
                    title: 'Register',
                    error: 'Username or email already exists'
                });
            }
            
            const user = new User({ username, email, password });
            await user.save();
            
            // Auto login
            req.login(user, (err) => {
                if (err) {
                    return res.redirect('/login');
                }
                res.redirect('/homepage');
            });
            
        } catch (error) {
            console.error('Registration error:', error);
            res.render('register', { 
                title: 'Register',
                error: 'Error during registration'
            });
        }
    });

    // Login Page
    router.get('/login', (req, res) => {
        if (req.isAuthenticated()) {
            return res.redirect('/homepage');
        }
        res.render('login', { title: 'Login' });
    });

    // Login User
    router.post('/login', passport.authenticate('local', {
        successRedirect: '/homepage',
        failureRedirect: '/login',
        failureFlash: false
    }));

    // Logout
    router.get('/logout', (req, res) => {
        req.logout((err) => {
            if (err) {
                console.error('Logout error:', err);
            }
            res.redirect('/login');
        });
    });

    return router;
};
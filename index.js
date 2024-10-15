// Import stuff
import express from "express";
import crypto from 'crypto'; // this does the optional challenge pasword hashing
import path from "path";
import { fileURLToPath } from "url";
import bodyParser from "body-parser";
import pg from "pg";
import session from 'express-session';

// Connect to db
const db = new pg.Client({
    user: "postgres",
    host: "localhost",
    database: "blogdb",
    password: "123456",
    port: 5432,
});

db.connect();

// Further setup stuff from Udemy vids
const app = express();
const port = 3000;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// More setup stuff
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.set('view engine', 'ejs');

// Set up session middleware
app.use(session({
    secret: '42069',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
}));

// logic to check if user is authenticated
function isAuthenticated(req, res, next) {
    if (req.session && req.session.user) {
        return next();
    } else {
        res.redirect('/signin');
    }
}

// Serve the home page
// uses SELECT
app.get("/", isAuthenticated, async (req, res) => {
    const result = await db.query('SELECT * FROM blogs ORDER BY date_created DESC');
    const posts = result.rows.map(post => {
        return {
            ...post,
            creationTime: post.date_created ? new Date(post.date_created).toLocaleString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : ''
        };
    });
    res.render('index', { posts });
});

// Serve the sign up page
app.get("/signup", (req, res) => {
    res.render("signup");
});

// Handle sign up form submission
app.post("/signup", async (req, res) => {
    const { name, password } = req.body;
    const hashedPassword = crypto.createHash('md5').update(password).digest('hex');
    const userCheck = await db.query('SELECT * FROM users WHERE name = $1', [name]);
    if (userCheck.rows.length > 0) {
        res.status(400).send("That username is taken!");
    } else {
        await db.query(
            'INSERT INTO users (name, password) VALUES ($1, $2)',
            [name, hashedPassword]
        );
        res.redirect("/signin");
    }
});

// Serve the sign in page
app.get("/signin", (req, res) => {
    res.render("signin");
});

// Handle sign in form submission
app.post("/signin", async (req, res) => {
    const { name, password } = req.body;
    const hashedPassword = crypto.createHash('md5').update(password).digest('hex');
    // uses SELECT and WHERE
    const result = await db.query(
        'SELECT * FROM users WHERE name = $1 AND password = $2',
        [name, hashedPassword]
    );
    if (result.rows.length > 0) {
        req.session.user = result.rows[0];
        res.redirect("/");
    } else {
        res.status(401).send("You got something wrong!");
    }
});

// Logic for creating a new blog post
app.post("/create-post", isAuthenticated, async (req, res) => {
    const { title, content, category } = req.body;
    await db.query(
        'INSERT INTO blogs (creator_user_id, creator_name, title, body, category, date_created) VALUES ($1, $2, $3, $4, $5, NOW())',
        [req.session.user.user_id, req.session.user.name, title, content, category]
    );
    res.redirect('/');
});

// Logic for serving the edit page
app.get("/edit-post/:id", isAuthenticated, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const result = await db.query('SELECT * FROM blogs WHERE blog_id = $1', [id]);
    const post = result.rows[0];
    if (post && parseInt(post.creator_user_id, 10) === parseInt(req.session.user.user_id, 10)) {
        res.render('edit', { post, index: id });
    } else {
        res.status(403).send('You cant edit someone elses post!');
    }
});

// Logic for editing a blog post
app.post("/edit-post/:id", isAuthenticated, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const { title, content, category } = req.body;
    await db.query(
        'UPDATE blogs SET title = $1, body = $2, category = $3, date_created = NOW() WHERE blog_id = $4 AND creator_user_id = $5',
        [title, content, category, id, req.session.user.user_id]
    );
    res.redirect('/');
});


// Logic for deleting a blog post
app.post("/delete-post/:id", isAuthenticated, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const result = await db.query('SELECT * FROM blogs WHERE blog_id = $1', [id]);
    const post = result.rows[0];
    // Uses DELETE
    if (post && parseInt(post.creator_user_id, 10) === parseInt(req.session.user.user_id, 10)) {
        await db.query('DELETE FROM blogs WHERE blog_id = $1', [id]);
        res.redirect('/');
    } else {
        res.status(403).send('You cant delete someone elses post!');
    }
});

// Serve the account page
app.get("/account", isAuthenticated, (req, res) => {
    res.render("account", { user: req.session.user });
});

// Logic for updating the accoutn details
app.post("/account", isAuthenticated, async (req, res) => {
    const { name, password } = req.body;
    const hashedPassword = crypto.createHash('md5').update(password).digest('hex');
    // uses UPDATE
    await db.query(
        'UPDATE users SET name = $1, password = $2 WHERE user_id = $3',
        [name, hashedPassword, req.session.user.user_id]
    );
    req.session.user.name = name;
    res.redirect("/");
});

// Start the server (I forced it to use port 3000 previously)
app.listen(port, () => {
    console.log(`Listening on port ${port}`);
});


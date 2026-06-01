# Full-Stack Database Project

This project is a full-stack application demonstrating a database interaction. It consists of a React frontend (client) and a Node.js backend (server).

## Getting Started

These instructions will get you a copy of the project up and running on your local machine for development and testing purposes.

### Prerequisites

Before you begin, ensure you have the following installed:

*   Node.js (LTS version recommended)
*   npm (comes with Node.js)
*   Git

### Installation

1.  **Clone the repository:**

    ```bash
    git clone <YOUR_REPOSITORY_URL>
    cd db
    ```

2.  **Install server dependencies:**

    ```bash
    cd server
    npm install
    cd ..
    ```

3.  **Install client dependencies:**

    ```bash
    cd client
    npm install
    cd ..
    ```

4.  **Set up environment variables:**

    Create a `.env` file in the root directory (d:\Air University\Semester 6\db lab\project\db) based on `.env.example` and fill in your database credentials and other necessary configurations.

    ```
    DB_HOST=localhost
    DB_USER=your_username
    DB_PASSWORD=your_password
    DB_NAME=your_database_name
    PORT=3000
    NODE_ENV=development
    ```

## Usage

### Running the Server

From the project root directory, navigate to the `server` directory and start the server:

```bash
cd server
node index.js
```

### Running the Client

From the project root directory, navigate to the `client` directory and start the client development server:

```bash
cd client
npm run dev
```

Open your browser and navigate to `http://localhost:5173` (or whatever port Vite indicates).

## Contributing

Please read CONTRIBUTING.md for details on our code of conduct, and the process for submitting pull requests to us.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
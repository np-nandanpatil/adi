# Smart Greenhouse IoT System

A responsive web application for monitoring and controlling a smart greenhouse environment using IoT sensors and Firebase.

## Features

- User authentication (registration and login)
- Real-time monitoring of temperature, humidity, and soil moisture
- Historical data visualization with interactive charts
- System setup request functionality
- Mobile-friendly responsive design
- Secure data storage using Firebase Firestore

## Prerequisites

- A Firebase account
- Web server or local development environment
- Modern web browser

## Setup Instructions

1. Create a new Firebase project at [https://console.firebase.google.com/](https://console.firebase.google.com/)

2. Enable Authentication in Firebase:
   - Go to Authentication > Sign-in method
   - Enable Email/Password authentication

3. Set up Firestore Database:
   - Go to Firestore Database
   - Create a new database
   - Start in production mode
   - Choose a location closest to your users

4. Configure Firebase in the project:
   - Go to Project Settings
   - Copy the Firebase configuration object
   - Replace the placeholder config in `js/firebase-config.js` with your configuration

5. Set up Firestore security rules:
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    match /sensorData/{document} {
      allow read: if request.auth != null;
      allow write: if false; // Only allow writes from your IoT devices
    }
    match /setupRequests/{document} {
      allow read, write: if request.auth != null;
    }
  }
}
```

6. Deploy the application to a web server or run locally using a development server.

## Project Structure

```
├── index.html              # Home page
├── register.html          # Registration page
├── login.html            # Login page
├── dashboard.html        # User dashboard
├── css/
│   └── style.css        # Main stylesheet
├── js/
│   ├── firebase-config.js  # Firebase configuration
│   ├── auth.js           # Authentication logic
│   └── dashboard.js      # Dashboard functionality
└── README.md            # Project documentation
```

## Usage

1. Open the application in a web browser
2. Register a new account or login with existing credentials
3. View real-time sensor data on the dashboard
4. Use the time range buttons to view historical data
5. Request system setup using the "Request System Setup" button

## Security Considerations

- All user data is stored securely in Firebase
- Authentication is handled through Firebase Authentication
- Data access is restricted based on user authentication
- Sensitive operations require user authentication

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details. 
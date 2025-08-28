# Use the official Node.js 20 image as the base image
FROM node:20

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json to leverage Docker cache
COPY package*.json ./

# Install application dependencies
RUN npm install --omit=dev

# Copy the rest of the application source code
COPY . .

# Create the data directory for the SQLite database
RUN mkdir -p data

# Expose the port the app runs on
EXPOSE 3000

# Run the 'start' script defined in package.json
CMD ["npm", "start"]
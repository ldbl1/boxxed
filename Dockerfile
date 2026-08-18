FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3001

# CAMBIAR ESTA LÍNEA (Usamos node directo en lugar de npm start)
CMD ["node", "server.js"]
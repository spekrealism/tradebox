FROM node:18-alpine

WORKDIR /app

# Копируем package.json и package-lock.json
COPY package*.json ./

# Устанавливаем зависимости
RUN npm install

# Копируем исходный код
COPY . .

# Сборка TypeScript
RUN npm run build

# Экспортируем порт
EXPOSE 3000

# Запускаем приложение
CMD ["npm", "run", "dev"] 
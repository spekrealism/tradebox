FROM node:24-alpine

WORKDIR /app

# Копируем package.json и устанавливаем зависимости
COPY package*.json ./
RUN npm install

# Копируем исходный код
COPY . .

# Явно копируем иконку
# COPY public/favicon.png public/favicon.png

# Экспортируем порт
EXPOSE 3001

# Запускаем в режиме разработки
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
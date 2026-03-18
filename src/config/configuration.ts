export default () => ({
  app: {
    url: process.env.APP_URL || 'http://localhost:5000',
  },
  port: parseInt(process.env.PORT as string, 10 ) || 5000,
  database: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/nest-blog',
  },
  jwt: {
    access: {
      secret: process.env.JWT_ACCESS_SECRET || 'access-secret-key-change-in-production',
      expiresIn: process.env.JWT_ACCESS_EXPIRE || '15m', // 15 минут
    },
    refresh: {
      secret: process.env.JWT_REFRESH_SECRET || 'refresh-secret-key-change-in-production',
      expiresIn: process.env.JWT_REFRESH_EXPIRE || '7d', // 7 дней
    },
  },
  bcrypt: {
    saltRounds: 10,
  },
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax' as const,
    domain: process.env.COOKIE_DOMAIN || undefined,
  },
});
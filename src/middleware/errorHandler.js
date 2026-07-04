const errorHandler = (err, req, res, next) => {
  // Avoid dumping raw stack traces (which can embed document bodies, query
  // args, PII) to stdout in production. In dev we keep the full stack for
  // debugging. Audit S-8 / BE-14.
  if (process.env.NODE_ENV === 'production') {
    console.error(`[errorHandler] ${err.name || 'Error'}: ${err.message || 'unknown'}`);
  } else {
    console.error(err.stack);
  }

  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map(e => e.message);
    return res.status(400).json({ success: false, message: 'Validation Error', errors: messages });
  }

  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    return res.status(400).json({ success: false, message: `Duplicate value for ${field}` });
  }

  if (err.name === 'CastError') {
    return res.status(400).json({ success: false, message: 'Invalid ID format' });
  }

  const status = err.statusCode || 500;
  // In production, never leak internal error messages for 5xx responses —
  // return a generic message instead. Audit S-8.
  const message = status >= 500 && process.env.NODE_ENV === 'production'
    ? 'Internal Server Error'
    : (err.message || 'Internal Server Error');
  res.status(status).json({ success: false, message });
};

module.exports = errorHandler;

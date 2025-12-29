/**
 * Safely extract error message from API error responses
 * Handles both string and object error responses to prevent React error #31
 * (Objects are not valid as a React child)
 */
export function getErrorMessage(error: any, defaultMessage: string = 'An error occurred'): string {
  if (!error) {
    return defaultMessage;
  }

  // If error is already a string, return it
  if (typeof error === 'string') {
    return error;
  }

  // If error has a response with data
  if (error.response?.data) {
    const serverError = error.response.data.error || error.response.data.message || error.response.data;
    
    // Handle string errors
    if (typeof serverError === 'string') {
      return serverError;
    }
    
    // Handle object errors - extract message property
    if (serverError && typeof serverError === 'object') {
      return serverError.message || serverError.error || JSON.stringify(serverError);
    }
  }

  // If error has a message property
  if (error.message) {
    return error.message;
  }

  // Fallback to default message
  return defaultMessage;
}


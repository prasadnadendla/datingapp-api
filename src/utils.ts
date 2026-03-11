

export function parseErrorMessage(error: any) {
  if (error.message.includes("favorites_pid_by_key")) {
    return {
      "errors": [
        {
          "message": "Favorite already exists",
          "extensions": {
            "path": "",
            "code": "FAVORITE_ALREADY_EXISTS"
          }
        }
      ]
    };
  } else if (error.message.includes("duplicate key value violates unique constraint")) {
    return {
      "errors": [
        {
          "message": "Resource already exists",
          "extensions": {
            "path": "",
            "code": "RESOURCE_ALREADY_EXISTS"
          }
        }
      ]
    };
  }
  // if (error.networkError) {
  //     return error.networkError.result.errors[0].message;
  // }
  return null;
}

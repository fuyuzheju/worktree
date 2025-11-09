# this is a middleware which processes all requests
# this middleware also saves the JWT, and processes login and logout

from .user import UserManager

class Requester:
    def __init__(self,
                 user_manager: UserManager):
        self.user_manager = user_manager
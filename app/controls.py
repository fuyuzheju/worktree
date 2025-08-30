class GlobalSignal:
    """
    especially for information stream exchange between different components.
    globally shared
    """
    def __init__(self):
        self.callbacks = []
    
    def connect(self, callback):
        self.callbacks.append(callback)
    
    def emit(self):
        for callback in self.callbacks:
            callback()

quit_signal = GlobalSignal()

# code below implements a proxy for global visit of attributes of the app
# you can import current_app in every corner of the project,
# to directly refer some attributes of the app object.
# ---- WARNING ----
# minimize the reference of current_app, 
# which increases code coupling, makes dependencies implicit, and decreases maintainability
# _app_instance = None
# def register_app(app):
#     global _app_instance
#     if _app_instance is not None:
#         raise RuntimeError("App has been registered.")
#     _app_instance = app

# def get_app():
#     if _app_instance is None:
#         raise RuntimeError("App has not been registered yet.")

# class CurrentAppProxy:
#     def __getattr__(self, name):
#         return getattr(get_app(), name)

#     def __setattr__(self, name, value):
#         return setattr(get_app(), name, value)

# current_app = CurrentAppProxy()


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

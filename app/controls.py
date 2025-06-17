class QuitSignal:
    def __init__(self):
        self.callbacks = []
    
    def connect(self, callback):
        self.callbacks.append(callback)
    
    def emit(self):
        for callback in self.callbacks:
            callback()

quit_signal = QuitSignal()
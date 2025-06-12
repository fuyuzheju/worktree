from PyQt5.QtWidgets import QApplication
from app.window import MainWindow
from app.keyboard_listener import global_listen
import sys, traceback

HOTKEY = '<ctrl>+f'

def global_exception_hook(exctype, value, tb):
    print("Traceback:")
    traceback.print_tb(tb)
    print("An unhandled exception occurred:", exctype, value)

if __name__ == '__main__':
    app = QApplication(sys.argv)
    app.setApplicationName("Work Tree")
    sys.excepthook = global_exception_hook

    main_window = MainWindow()
    main_window.show()

    global_listener, emitter = global_listen(HOTKEY, main_window)

    exit_code = app.exec_()

    if global_listener:
        print("App quited. Trying to stop global listener.")
        global_listener.stop()

    sys.exit(exit_code)



import sys, logging

def global_exception_hook(exctype, value, tb):
    logging.error("Uncaught exception:", exc_info=(exctype, value, tb))

if __name__ == '__main__':
    from app import Application
    app = Application(sys.argv)
    sys.excepthook = global_exception_hook
    logger = logging.getLogger()

    exit_code = app.exec_()

    # cleanup
    app.cleanup()
    sys.exit(exit_code)

import sys, logging

def global_exception_hook(exctype, value, tb):
    logging.error("Uncaught exception:", exc_info=(exctype, value, tb))

if __name__ == '__main__':
    from app import Application
    # from app.controls import register_app
    app = Application(sys.argv)
    # register_app(app)
    sys.excepthook = global_exception_hook

    exit_code = app.exec_()

    logger = logging.getLogger()
    logger.info("Application quit.")

    # cleanup
    sys.exit(exit_code)

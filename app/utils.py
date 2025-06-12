try:
    from AppKit import NSApp, NSApplicationActivationPolicyRegular, NSApplicationActivationPolicyAccessory, NSApplicationActivationPolicyProhibited
    def set_app_state(active):
        if not NSApp:
            return
        try:
            if active:
                NSApp.activateIgnoringOtherApps_(True)
                NSApp.setActivationPolicy_(NSApplicationActivationPolicyRegular)
            else:
                NSApp.setActivationPolicy_(NSApplicationActivationPolicyAccessory)
        except Exception as e:
            print(f"Failed to set app state: {e}")

except:
    def set_app_state(active):
        pass
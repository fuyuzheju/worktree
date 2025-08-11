from typing import Optional
import logging, sys, asyncio

logger = logging.getLogger(__name__)

class Notification:
    """Show a notification."""

    @classmethod
    async def notify(cls, title: str, 
               message: str, 
               actions: list[str], 
               delay: Optional[list[str]] = None) -> tuple[str, str] | None:
        """
        Call the APIs of various systems to generate a notification message.
          - title: str - the string which will be showed in notifications' title.
          - message: str - the descriptive information which will be showed in notifications' content.
          - actions: list[str] - a list of strings that will be showed as buttons in notification.
          - delay: Optional[list[str]] - a list of strings for the delay dropdown options.
        return:
          - tuple[str, str] - a tuple whose first element is 'action' or 'delay',
            the second element is action name or delay time (minutes).
        """
        try:
            from winsdk.windows.ui.notifications import ToastNotificationManager, ToastNotification, ToastActivatedEventArgs
            from winsdk.windows.data.xml.dom import XmlDocument
            from winsdk.windows.foundation import IPropertyValue

        except ImportError:
            logger.debug('Package Not Found: winsdk')
            return
        
        result_value = None
        
        inputs_xml = ""
        buttons_xml = ""

        if delay:
            inputs_xml += '<input id="delay" type="selection">'
            for option in delay:
                inputs_xml += f'<selection id="{option}" content="{option} min" />'
            inputs_xml += '<selection id="custom" content="Custom..." />'
            inputs_xml += '</input>'
            inputs_xml += '<input id="custom_delay" type="text" placeHolderContent="Choose Custom to enter delay minute" />'
            buttons_xml += '<action content="Delay" arguments="__delay" activationType="background" />'
        
        for text in actions:
            buttons_xml += f'<action content="{text}" arguments="__action:{text}" />'
        
        xml_str = f"""
        <toast scenario="reminder">
            <visual>
                <binding template="ToastGeneric">
                    <text>{title}</text>
                    <text>{message}</text>
                </binding>
            </visual>
            <actions>
                {inputs_xml}
                {buttons_xml}
            </actions>
        </toast>
        """

        xml = XmlDocument()
        xml.load_xml(xml_str)
        notifier = ToastNotificationManager.create_toast_notifier(sys.executable)
        notification = ToastNotification(xml)

        loop = asyncio.get_running_loop()
        future = loop.create_future()
        

        def activated(sender, args_obj):
            nonlocal result_value
            try:
                args = ToastActivatedEventArgs._from(args_obj).arguments
                if args.startswith("__action:"):
                    result_value = ('action', args[len("__action:"):])
                elif args == "__delay":
                    user_inputs = ToastActivatedEventArgs._from(args_obj).user_input
                    delay_choice = IPropertyValue._from(user_inputs["delay"]).get_string()
                    if delay_choice == "custom":
                        custom_value = ""
                        if "custom_delay" in user_inputs:
                            custom_value = IPropertyValue._from(user_inputs["custom_delay"]).get_string()
                            result_value = ('delay', custom_value)
                    elif "delay" in user_inputs:
                        result_value = ('delay', delay_choice)
            except Exception as e:
                logger.error(f"Error processing activation: {e}")
                result_value = ("error", None)
            finally:
                if not future.done():
                    loop.call_soon_threadsafe(future.set_result, result_value)

        def dismissed(sender, args_obj):
            if not future.done():
                loop.call_soon_threadsafe(future.set_result, None)

        def failed(sender, args_obj):
            if not future.done():
                loop.call_soon_threadsafe(future.set_result, None)

        notification.add_activated(activated)
        notification.add_dismissed(dismissed)
        notification.add_failed(failed)
        notifier.show(notification)

        return await future

async def main():
        result = await Notification.notify('114', '114', actions=['1'], delay=['1', '2'])
        print(result)

if __name__ == '__main__':
    asyncio.run(main())

# hooks/hook-my_app.commands.py

from PyInstaller.utils.hooks import collect_submodules

hiddenimports = collect_submodules('app.main_window.console.commands')
# print("##### HOOK #####")
# print(hiddenimports)
# print(collect_submodules('app.main_window.console.commands'))
# print("##### HOOK #####")
# pip freeze > requirements.txt
#* -- Imports
import os

#* -- Variables
path = os.path.dirname(__file__) #? Directory path

#* -- Functions
def clearConsole() -> None: #? Clear console
    os.system("cls" if os.name == "nt" else "clear")

def main() -> None:
    pass

#! Main
if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(e)

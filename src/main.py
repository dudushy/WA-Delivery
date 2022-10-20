# pip freeze > requirements.txt
# * -- Imports
import os
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.common.by import By
# import time

# * -- Variables
PATH = os.path.dirname(__file__).replace(
    os.path.dirname(__file__)[0],
    os.path.dirname(__file__)[0].upper(),
    1
    ).replace('\\src', '', 1) # ? Directory path
DRIVE_PATH = f'{PATH}\\drivers\\chromedriver.exe'

chrome_options = Options()
# chrome_options.add_argument('--incognito')
# chrome_options.add_argument('--databaseEnabled')
# chrome_options.add_argument('--applicationCacheEnabled')
# chrome_options.add_argument('--webStorageEnabled')
chrome_options.add_argument(f'--user-data-dir={PATH}\\data')
# chrome_options.add_argument(f'{PATH}--user-data-dir=\\..\\data')
# chrome_options.add_argument('--user-data-dir=C:\\Users\\User\\Documents\\0PCSync\\0CODE\\GitHub\\WA-Delivery\\data')
chrome_options.add_experimental_option('excludeSwitches', ['enable-logging'])

driver = webdriver.Chrome(executable_path=DRIVE_PATH, options=chrome_options)

# * -- Functions
def clearConsole() -> None:  # ? Clear console
    os.system("cls" if os.name == "nt" else "clear")


def main() -> None:
    # driver.get("https://web.whatsapp.com/")
    phone = '' #TODO Phone number
    text = 'testWA-Delivery'
    # driver.get("https://wa.me/5511964257899?text=testWA-Delivery")
    driver.get(f"https://web.whatsapp.com/send/?phone={phone}&text={text}&type=phone_number&app_absent=0")
    # elem = driver.find_element(By.NAME, "q")
    # elem.clear()
    # elem.send_keys("pycon")
    # elem.send_keys(Keys.RETURN)
    # driver.send_keys(Keys.RETURN)
    input("DO NOT CLOSE THE TAB!!!\nPress Enter to close...")
    driver.close()

#! Main
if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(e)

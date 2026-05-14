import subprocess
import time

def get_files():
    result = subprocess.run(['git', 'ls-files', '-m', '-o', '-d', '-z', '--exclude-standard'], capture_output=True)
    # Split by null terminator and remove empty strings
    files = [f for f in result.stdout.split(b'\0') if f]
    return files

def main():
    files = get_files()
    total = len(files)
    print(f"Total files to process: {total}")
    
    if total == 0:
        print("No files to commit.")
        return

    batch_size = 100
    batch_num = 1
    
    for i in range(0, total, batch_size):
        batch = files[i:i+batch_size]
        print(f"Processing batch {batch_num} (files {i+1} to {min(i+batch_size, total)})...")
        
        # Git add
        # We need to decode the byte strings for git add, but since paths might have strange characters, 
        # it's safer to pass them as bytes if possible, but subprocess accepts bytes in args in Python 3.
        add_cmd = [b'git', b'add', b'--'] + batch
        subprocess.run(add_cmd, check=True)
        
        # Git commit
        commit_msg = f"Batch update {batch_num}"
        commit_cmd = ['git', 'commit', '-m', commit_msg]
        try:
            subprocess.run(commit_cmd, check=True)
        except subprocess.CalledProcessError:
            print("Commit failed or nothing to commit in this batch. Continuing...")
            
        # Git push
        print("Pushing...")
        try:
            subprocess.run(['git', 'push', 'origin', 'main'], check=True)
        except subprocess.CalledProcessError as e:
            print(f"Push failed: {e}")
            break
            
        batch_num += 1
        time.sleep(1) # brief pause
        
if __name__ == "__main__":
    main()
